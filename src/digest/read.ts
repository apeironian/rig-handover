import type { ReadNight } from './types.js';

// Stub so section 2 compiles against the signature. The reader lands in issue #2.
export const readNight: ReadNight = () => {
  throw new Error('readNight: not implemented (issue #2)');
};
