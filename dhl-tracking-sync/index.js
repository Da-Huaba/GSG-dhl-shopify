const { run } = require('./src/sync');
run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
