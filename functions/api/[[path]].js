// Forwards every /api/* request to the single Durable Object that holds all plans.
export async function onRequest({ request, env }) {
  const stub = env.PLANS.get(env.PLANS.idFromName('main'));
  return stub.fetch(request);
}
