// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// Snapshot and restore of default-scope settings in `core_config_data` for the
// scripts that change configuration for a run. A setting has three stored
// states and the restore puts back the one it found: no row (the value comes
// from config.xml), a row holding SQL NULL, or a row with a value. Reading the
// effective value (`config:show`) or the plain column cannot tell them apart,
// and writing the result back with `config:set` leaves a row where there was
// none, or the text "NULL" where there was SQL NULL.
//
// `sql(query)` runs one statement with the mysql client's `-N` output and
// returns what it printed.
export function makeConfigSnapshot(sql) {
    const run = (query) => String(sql(query) ?? '').trim();
    const where = (configPath) => `scope = 'default' and scope_id = 0 and path = '${configPath}'`;

    // The setting as stored. The value travels as hex, so any text survives the trip.
    const configSnapshot = (configPath) => {
        const raw = run(`select if(value is null, 'N', concat('V', hex(value))) from core_config_data where ${where(configPath)}`);
        if (raw === '') return { state: 'absent', value: null };
        if (raw === 'N') return { state: 'null', value: null };
        return { state: 'value', value: Buffer.from(raw.slice(1), 'hex').toString('utf8') };
    };

    // The stored value, null when there is no row or the row holds SQL NULL.
    const configValue = (configPath) => configSnapshot(configPath).value;

    // Puts a setting back exactly as the snapshot found it: the row removed, SQL NULL, or the stored value byte for byte.
    // The caller flushes the configuration cache afterwards.
    const restoreConfig = (configPath, snapshot) => {
        if (snapshot.state === 'absent') {
            run(`delete from core_config_data where ${where(configPath)}`);
            return;
        }
        const stored = snapshot.state === 'null' ? 'NULL' : `unhex('${Buffer.from(snapshot.value, 'utf8').toString('hex')}')`;
        run(`insert into core_config_data (scope, scope_id, path, value) values ('default', 0, '${configPath}', ${stored}) on duplicate key update value = ${stored}`);
    };

    // What a log line says about a snapshot.
    const describe = (snapshot) => (snapshot.state === 'absent' ? '(unset)' : snapshot.state === 'null' ? '(null)' : snapshot.value);

    return { configSnapshot, configValue, restoreConfig, describe };
}
