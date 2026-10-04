import * as migration_20261004_203615_initial from './20261004_203615_initial';

export const migrations = [
  {
    up: migration_20261004_203615_initial.up,
    down: migration_20261004_203615_initial.down,
    name: '20261004_203615_initial'
  },
];
