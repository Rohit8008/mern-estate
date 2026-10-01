import { buildMongodumpArgs } from '../scripts/backup.js';

describe('backup script mongodump argv', () => {
  it('passes the URI as one argv element, untouched by shell metacharacters', () => {
    const uri = 'mongodb://u:p"$(touch /tmp/x);`id`@host:27017/db?a=1&b=2';
    const args = buildMongodumpArgs(uri, '/backups/backup-2026-01-01T00-00-00');
    expect(args).toEqual([
      `--uri=${uri}`,
      '--out=/backups/backup-2026-01-01T00-00-00',
      '--gzip',
    ]);
  });

  it('importing the module does not start a backup', () => {
    expect(typeof buildMongodumpArgs).toBe('function');
  });
});
