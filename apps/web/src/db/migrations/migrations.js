// This file is required for Expo/React Native SQLite migrations - https://orm.drizzle.team/quick-sqlite/expo

import journal from './meta/_journal.json';
import m0000 from './0000_fantastic_trish_tilby.sql';
import m0001 from './0001_omniscient_james_howlett.sql';
import m0002 from './0002_grey_psynapse.sql';
import m0003 from './0003_open_blur.sql';
import m0004 from './0004_first_sue_storm.sql';
import m0005 from './0005_green_thing.sql';
import m0006 from './0006_glossy_daimon_hellstrom.sql';
import m0007 from './0007_fix_pg_timestamps.sql';

  export default {
    journal,
    migrations: {
      m0000,
m0001,
m0002,
m0003,
m0004,
m0005,
m0006,
m0007
    }
  }
  