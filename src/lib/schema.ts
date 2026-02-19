import { z } from 'zod';

export const muscleGroupSchema = z.enum([
  'pecho',
  'espalda',
  'pierna',
  'hombro',
  'brazo',
  'core',
  'otros',
]);

export const implementSchema = z.enum([
  'maquina',
  'barra',
  'barra_z',
  'mancuerna',
  'polea',
  'corporal',
  'rueda_abs',
  'paralelas',
  'disco',
  'banda',
  'otros',
]);

// Settings
export const settingsSchema = z.object({
  unit: z.enum(['kg', 'lb']),
  defaultRestSec: z.number().finite(),
  sound: z.boolean(),
  vibration: z.boolean(),
  theme: z.enum(['system', 'light', 'dark']),
}).passthrough();

// Workout set within a session
const setSchema = z.object({
  id: z.string(),
  exerciseId: z.string(),
  exerciseName: z.string().optional(),
  mode: z.string(),
  reps: z.number().finite().optional(),
  weightKg: z.number().finite().optional(),
  rpe: z.number().finite().optional(),
  rir: z.number().finite().optional(),
  tempo: z.string().optional(),
  at: z.number().int(),
  adhoc: z.boolean().optional(),
  drop: z.boolean().optional(),
}).passthrough();

// Training session
export const sessionSchema = z.object({
  id: z.string(),
  type: z.string(),
  dateISO: z.string(),
  routineKey: z.string().optional(),
  sets: z.array(setSchema).optional(),
  durationSec: z.number().finite().optional(),
  distanceKm: z.number().finite().optional(),
  totalVolume: z.number().finite().optional(),
}).passthrough();

export const sessionsSchema = z.array(sessionSchema);

// Routine exercises
const routineExerciseSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  mode: z.string(),
  targetSets: z.number().finite().optional(),
  targetReps: z.number().finite().optional(),
  targetRepsRange: z.string().optional(),
  targetTimeSec: z.number().finite().optional(),
  restSec: z.number().finite().optional(),
}).passthrough();

// Routine
export const routineSchema = z.object({
  name: z.string(),
  exercises: z.array(routineExerciseSchema),
}).passthrough();

export const routinesSchema = z.array(routineSchema);

// Profiles by exercise id
export const profileByExerciseIdSchema = z.record(z.object({
  last: z.object({
    weightKg: z.number().finite().optional(),
    reps: z.number().finite().optional(),
    rir: z.number().finite().optional(),
    dateISO: z.string().optional(),
    setup: z.string().optional(),
  }).partial().optional(),
  next: z.object({
    weightKg: z.number().finite().optional(),
    reps: z.number().finite().optional(),
    rir: z.number().finite().optional(),
    dateISO: z.string().optional(),
    setup: z.string().optional(),
  }).partial().optional(),
}).passthrough());

const customExerciseSchema = z.object({
  id: z.string(),
  name: z.string(),
  mode: z.string(),
  category: z.string().optional(),
  muscles: z.array(z.string()).min(1),
  muscleGroup: muscleGroupSchema,
  implement: implementSchema,
  fixed: z.object({
    targetSets: z.number().finite().optional(),
    targetRepsRange: z.string().optional(),
    targetTimeSec: z.number().finite().optional(),
    restSec: z.number().finite().optional(),
  }).partial().optional(),
  notes: z.string().optional(),
}).passthrough();

// User routines index
export const userRoutinesIndexSchema = z.record(z.array(z.string()));

// Entire data blob
export const dataSchema = z.object({
  version: z.number().int().optional(),
  settings: settingsSchema,
  sessions: sessionsSchema,
  routines: routinesSchema.optional(),
  profileByExerciseId: profileByExerciseIdSchema,
  userRoutinesIndex: userRoutinesIndexSchema.optional(),
  customExercisesById: z.record(customExerciseSchema).optional(),
  customRoutineNames: z.record(z.string()).optional(),
}).passthrough();

export default dataSchema;
