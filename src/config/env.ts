import { z } from 'zod';

const envSchema = z.object({
  // OP.GG Configuration
  OPGG_GAME_NAME: z.string().min(1, 'OPGG_GAME_NAME is required'),
  OPGG_TAG_LINE: z.string().min(1, 'OPGG_TAG_LINE is required'),
  OPGG_REGION: z.string().min(1, 'OPGG_REGION is required'),

  // Clockify API Configuration
  CLOCKIFY_API_TOKEN: z.string().min(1, 'Clockify API token is required'),
  CLOCKIFY_API_BASE: z.string().url('CLOCKIFY_API_BASE must be a valid URL'),
  CLOCKIFY_API_DELAY: z
    .string()
    .transform((val) => parseInt(val, 10))
    .refine((val) => !Number.isNaN(val) && val >= 0 && val <= 10000, {
      message: 'CLOCKIFY_API_DELAY must be a number between 0 and 10000 (milliseconds)',
    }),

  // Application Configuration
  NODE_ENV: z.enum(['development', 'production', 'test'], {
    errorMap: () => ({ message: 'NODE_ENV must be one of: development, production, test' }),
  }),
  SYNC_DAYS: z
    .string()
    .transform((val) => parseInt(val, 10))
    .refine((val) => !Number.isNaN(val) && val >= 1 && val <= 3650, {
      message: 'SYNC_DAYS must be a number between 1 and 3650',
    }),

  // Project Configuration
  LEAGUE_PROJECT_NAME: z.string().min(1, 'LEAGUE_PROJECT_NAME is required'),
});

export type Environment = z.infer<typeof envSchema>;

let cachedEnv: Environment | null = null;

export function validateEnvironment(skipDotenv = false): Environment {
  if (cachedEnv) {
    return cachedEnv;
  }

  if (!skipDotenv) {
    try {
      require('dotenv/config');
    } catch (error) {
      console.error('❌ Failed to load .env file:', error);
      process.exit(1);
    }
  }

  try {
    cachedEnv = envSchema.parse(process.env);

    console.log('✅ Environment validation successful');
    console.log(`   Environment: ${cachedEnv.NODE_ENV}`);
    console.log(`   Sync Days: ${cachedEnv.SYNC_DAYS}`);
    console.log(`   Summoner: ${cachedEnv.OPGG_GAME_NAME}#${cachedEnv.OPGG_TAG_LINE} (${cachedEnv.OPGG_REGION.toUpperCase()})`);

    return cachedEnv;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('\n❌ Environment validation failed:\n');

      const missingVars: string[] = [];
      const invalidVars: string[] = [];

      for (const err of error.errors) {
        const field = err.path.join('.');
        if (err.code === 'invalid_type' && err.received === 'undefined') {
          missingVars.push(`  - ${field}: ${err.message}`);
        } else {
          invalidVars.push(`  - ${field}: ${err.message}`);
        }
      }

      if (missingVars.length > 0) {
        console.error('Missing required variables:');
        for (const msg of missingVars) console.error(msg);
        console.error('');
      }

      if (invalidVars.length > 0) {
        console.error('Invalid variable values:');
        for (const msg of invalidVars) console.error(msg);
        console.error('');
      }

      console.error('Please check your .env file and ensure all required variables are set correctly.');
      console.error('See env.example for the required configuration.\n');
    } else {
      console.error('❌ Environment validation error:', error);
    }

    process.exit(1);
  }
}

export function getEnvironment(): Environment {
  if (!cachedEnv) {
    throw new Error('Environment not validated yet. Call validateEnvironment() first.');
  }
  return cachedEnv;
}

export function resetEnvironment(): void {
  cachedEnv = null;
}
