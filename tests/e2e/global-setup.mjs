import { checkStand } from './stand.mjs';

export default async function globalSetup() {
  await checkStand();
}
