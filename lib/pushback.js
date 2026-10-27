// Keeps reminder replies safe until the owner supplies the local pushback rules.
export default async function pushbackStub() {
  return { pushBack: false, source: 'stub' };
}
