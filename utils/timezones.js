// utils/timezones.js
const moment = require('moment-timezone');

const timezones = moment.tz.names()
    .filter(tz => {
        const zone = moment.tz.zone(tz);
        return zone.countries().length > 0;
    })
    .map(tz => {
        const offset = moment.tz(tz).format('Z');
        return {
            label: `${tz} (UTC${offset})`,
            value: tz,
        };
    });

module.exports = timezones;
