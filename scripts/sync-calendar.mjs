/**
 * Holt die iCal-Feeds der Buchungsportale, führt die belegten Zeiträume
 * zusammen und schreibt sie für die Website weg.
 *
 * Erzeugt:
 *   data/belegung.json   – von der Seite gelesen, rendert den Kalender
 *   belegung.ics         – Sammel-Feed, den andere Portale importieren können
 *
 * Dieses Skript wird von Hand ausgeführt, wenn die Belegung der Portale
 * übernommen werden soll:
 *
 *   ICAL_URLS="Booking.com|https://admin.booking.com/hotel/ical/....ics" \
 *     node scripts/sync-calendar.mjs
 *
 * Mehrere Feeds durch Zeilenumbruch oder Komma trennen. Die URLs enthalten
 * Zugriffstokens – nicht ins Repository schreiben, nur als Umgebungsvariable
 * übergeben.
 *
 * Für die reine Handpflege braucht es dieses Skript nicht: Die Website liest
 * data/sperrzeiten.json direkt.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const OUT_JSON = 'data/belegung.json';
const OUT_ICS = 'belegung.ics';
const MANUAL = 'data/sperrzeiten.json';

/* ------------------------------------------------------------------ Datum */

/** iCal-Datumsangaben (20270710 oder 20270710T140000Z) auf YYYY-MM-DD bringen. */
function toDate(value) {
    const match = value.match(/(\d{4})(\d{2})(\d{2})/);
    return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function addDays(date, days) {
    const d = new Date(date + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

/* -------------------------------------------------------------- iCal lesen */

/** RFC 5545 faltet lange Zeilen: Fortsetzung beginnt mit Space oder Tab. */
function unfold(text) {
    return text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
}

function parseEvents(ics, source) {
    const events = [];

    for (const block of unfold(ics).split('BEGIN:VEVENT').slice(1)) {
        const body = block.split('END:VEVENT')[0];

        const start = body.match(/^DTSTART[^:]*:(.+)$/m);
        const end = body.match(/^DTEND[^:]*:(.+)$/m);
        if (!start || !end) continue;

        const from = toDate(start[1].trim());
        const to = toDate(end[1].trim());
        if (!from || !to || to <= from) continue;

        const summary = body.match(/^SUMMARY:(.*)$/m);
        events.push({ from, to, source, summary: summary ? summary[1].trim() : '' });
    }

    return events;
}

/** Überlappende und direkt aneinandergrenzende Zeiträume zusammenfassen. */
function mergeRanges(events) {
    const sorted = [...events].sort((a, b) => a.from.localeCompare(b.from));
    const merged = [];

    for (const event of sorted) {
        const last = merged[merged.length - 1];
        if (last && event.from <= last.to) {
            if (event.to > last.to) last.to = event.to;
        } else {
            merged.push({ from: event.from, to: event.to });
        }
    }

    return merged;
}

/* ---------------------------------------------------------------- Ausgabe */

function buildIcs(ranges) {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Ferienhaus Kuestenfein//Belegung//DE',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'X-WR-CALNAME:Belegung Ferienhaus Kuestenfein'
    ];

    ranges.forEach((range, i) => {
        lines.push(
            'BEGIN:VEVENT',
            `UID:belegung-${i}-${range.from}@kuestenfein.de`,
            `DTSTAMP:${stamp}`,
            `DTSTART;VALUE=DATE:${range.from.replace(/-/g, '')}`,
            `DTEND;VALUE=DATE:${range.to.replace(/-/g, '')}`,
            'SUMMARY:Belegt',
            'TRANSP:OPAQUE',
            'END:VEVENT'
        );
    });

    lines.push('END:VCALENDAR');
    return lines.join('\r\n') + '\r\n';
}

function write(path, content) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
}

/* ------------------------------------------------------------------- Lauf */

const sources = (process.env.ICAL_URLS || '')
    .split(/[\n,]+/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
        const parts = line.split('|');
        return parts.length > 1
            ? { name: parts[0].trim(), url: parts.slice(1).join('|').trim() }
            : { name: new URL(line).hostname, url: line };
    });

const events = [];
let failed = 0;

/* Von Hand gepflegte Sperrzeiten aus data/sperrzeiten.json übernehmen. */
if (existsSync(MANUAL)) {
    try {
        const entries = JSON.parse(readFileSync(MANUAL, 'utf8'));
        for (const entry of entries) {
            if (!entry || !entry.from || !entry.to || entry.to <= entry.from) {
                console.error(`  Sperrzeiten: Eintrag übersprungen – ${JSON.stringify(entry)}`);
                continue;
            }
            events.push({ from: entry.from, to: entry.to, source: 'manuell', summary: entry.notiz || '' });
        }
        console.log(`  Sperrzeiten (von Hand): ${entries.length} Einträge`);
    } catch (error) {
        console.error(`  ${MANUAL} ist fehlerhaft – ${error.message}`);
        process.exit(1);
    }
}

if (!sources.length && !events.length) {
    console.error('Weder Feeds in ICAL_URLS noch Sperrzeiten gefunden – nichts zu tun.');
    process.exit(1);
}

for (const source of sources) {
    try {
        const response = await fetch(source.url, {
            headers: { 'User-Agent': 'kuestenfein-calendar-sync' },
            signal: AbortSignal.timeout(30000)
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const found = parseEvents(await response.text(), source.name);
        events.push(...found);
        console.log(`  ${source.name}: ${found.length} Einträge`);
    } catch (error) {
        failed++;
        console.error(`  ${source.name}: FEHLER – ${error.message}`);
    }
}

// Lieber den alten Stand behalten, als eine leere Belegung zu veröffentlichen.
if (sources.length && failed === sources.length) {
    console.error('Alle Feeds fehlgeschlagen – bestehende Daten bleiben unverändert.');
    process.exit(1);
}

const ranges = mergeRanges(events);
const today = new Date().toISOString().slice(0, 10);
const future = ranges.filter(range => range.to > today);

write(OUT_JSON, JSON.stringify({
    updated: new Date().toISOString(),
    sources: [...sources.map(source => source.name), ...(existsSync(MANUAL) ? ['manuell'] : [])],
    // "to" ist der Abreisetag und damit selbst wieder frei.
    ranges: future
}, null, 2) + '\n');

write(OUT_ICS, buildIcs(future));

console.log(`\n${future.length} belegte Zeiträume geschrieben (${events.length} Einträge gesamt).`);
console.log(`Nächster belegter Tag: ${future[0] ? future[0].from : '–'}`);
