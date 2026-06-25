/**
 * Re-export of the SHARED client/server protocol types. The mobile client and
 * the server cannot drift because they reference the same file
 * (../../../server/src/net/protocol.ts), bundled via Metro watchFolders.
 */
export type * from '../../../server/src/net/protocol.ts';
