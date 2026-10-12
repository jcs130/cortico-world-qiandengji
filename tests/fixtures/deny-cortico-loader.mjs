export async function resolve(specifier, context, next) {
  if (specifier === 'cortico' || specifier.startsWith('cortico/')) throw new Error(`CORTICO_RUNTIME_FORBIDDEN: ${specifier}`);
  return next(specifier, context);
}
