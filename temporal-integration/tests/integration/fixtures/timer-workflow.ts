/**
 * Timer workflow fixture for testing time manipulation
 */

import { sleep, log } from '@temporalio/workflow';

export async function timerWorkflow(input: {
  delay: string;
  iterations: number;
}): Promise<{ completedIterations: number; totalTime: string }> {
  const { delay, iterations } = input;
  const startTime = Date.now();
  
  log.info('Timer workflow started', { delay, iterations });
  
  for (let i = 0; i < iterations; i++) {
    log.info('Starting iteration', { iteration: i + 1, iterations });
    
    // Sleep for the specified delay
    await sleep(delay);
    
    log.info('Iteration completed', { iteration: i + 1, iterations });
  }
  
  const totalTime = Date.now() - startTime;
  
  log.info('Timer workflow completed', { 
    completedIterations: iterations,
    totalTimeMs: totalTime
  });
  
  return {
    completedIterations: iterations,
    totalTime: `${totalTime}ms`
  };
}