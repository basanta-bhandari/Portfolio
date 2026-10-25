export async function resolve(specifier, context, next) {
  if (specifier === '@neondatabase/serverless') return {
    url: 'data:text/javascript,export const neon = () => (...args) => globalThis.__portfolioTestSql(...args);', shortCircuit: true
  };
  return next(specifier, context);
}
