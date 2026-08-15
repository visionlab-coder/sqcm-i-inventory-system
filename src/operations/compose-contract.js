const REQUIRED_SERVICES = ['backend', 'database', 'frontend'];

function serviceNames(yaml) {
  const names = [];
  let inServices = false;
  for (const line of String(yaml).split(/\r?\n/)) {
    if (line === 'services:') {
      inServices = true;
      continue;
    }
    if (inServices && /^\S/.test(line)) break;
    const match = inServices ? line.match(/^  ([a-zA-Z0-9_-]+):\s*$/) : null;
    if (match) names.push(match[1]);
  }
  return names;
}

function validateThreeServiceContract(baseYaml, productionYaml) {
  const base = serviceNames(baseYaml).sort();
  const production = serviceNames(productionYaml).sort();
  const allowed = [...REQUIRED_SERVICES].sort();
  const merged = [...new Set([...base, ...production])].sort();
  if (JSON.stringify(base) !== JSON.stringify(allowed)) throw new Error(`Base Compose services must be ${allowed.join(', ')}; received ${base.join(', ')}`);
  const unexpected = production.filter(name => !allowed.includes(name));
  if (unexpected.length) throw new Error(`Production override adds forbidden services: ${unexpected.join(', ')}`);
  if (JSON.stringify(merged) !== JSON.stringify(allowed)) throw new Error(`Effective Compose services must be ${allowed.join(', ')}`);
  return { services: merged, count: merged.length };
}

module.exports = { REQUIRED_SERVICES, serviceNames, validateThreeServiceContract };
