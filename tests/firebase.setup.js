// Minimal placeholder for Firebase emulator setup used by chat delivery tests.
// The actual emulator-dependent tests are skipped unless FIREBASE_EMULATOR_HOST is set.
export const requireEmulator = () => {
  if (!process.env.FIREBASE_EMULATOR_HOST) {
    throw new Error('FIREBASE_EMULATOR_HOST not set; start the Firebase emulator suite to run these tests.');
  }
};
