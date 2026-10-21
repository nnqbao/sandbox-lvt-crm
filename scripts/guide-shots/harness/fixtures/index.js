// Fixture registry for the guide harness.
//
// Every other module in this folder exports:
//   export const queries   = { 'module:function': value | (args, ctx) => value };
//   export const mutations = { 'module:function': value | (args, ctx) => value };   (optional)
// ctx = { scenario, persona, state }. Return `undefined` to show a loading state.
// A shot can force a value with `overrides: { 'module:function': value }`.
//
// ALL DATA IS FICTIONAL. Never paste real names, classes or students here.
import { personaFor } from './personas.js';

const modules = import.meta.glob(['./*.js', '!./index.js'], { eager: true });

const queryTable = {};
const mutationTable = {};
for (const [file, mod] of Object.entries(modules)) {
  for (const [table, source] of [[queryTable, mod.queries], [mutationTable, mod.mutations]]) {
    for (const [name, value] of Object.entries(source || {})) {
      if (name in table) console.warn(`[guide] fixture ${name} defined twice (${file})`);
      table[name] = value;
    }
  }
}

function context() {
  const guide = window.__GUIDE__ || {};
  const scenario = guide.scenario || 'teacher';
  return { scenario, persona: personaFor(scenario), state: guide.state || {} };
}

function noteMissing(kind, name) {
  window.__GUIDE_MISSING__ = window.__GUIDE_MISSING__ || new Set();
  if (!window.__GUIDE_MISSING__.has(`${kind}:${name}`)) {
    window.__GUIDE_MISSING__.add(`${kind}:${name}`);
    console.warn(`[guide] no fixture for ${kind} ${name}`);
  }
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

export function runQuery(name, args) {
  const overrides = window.__GUIDE__?.overrides || {};
  if (name in overrides) return clone(overrides[name]);
  if (!(name in queryTable)) {
    noteMissing('query', name);
    return undefined;
  }
  const entry = queryTable[name];
  return clone(typeof entry === 'function' ? entry(args, context()) : entry);
}

export function runMutation(name, args) {
  const entry = mutationTable[name];
  if (entry === undefined) return null;
  return clone(typeof entry === 'function' ? entry(args, context()) : entry);
}
