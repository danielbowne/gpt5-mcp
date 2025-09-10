import fetch from 'node-fetch';

interface GPT5ResponseRequest {
  model: string;
  input: string | Array<{
    role: 'user' | 'developer' | 'assistant';
    content: string | Array<{
      type: 'input_text' | 'input_image' | 'input_file';
      text?: string;
      image_url?: string;
      file_id?: string;
      file_url?: string;
    }>;
  }>;
  instructions?: string;
  reasoning?: {
    effort?: 'low' | 'medium' | 'high';
  };
  tools?: Array<{
    type: 'web_search_preview' | 'file_search' | 'function';
    [key: string]: any;
  }>;
  stream?: boolean;
  background?: boolean;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
}

interface GPT5Response {
  id?: string;
  status?: 'queued' | 'in_progress' | 'completed' | 'incomplete' | 'cancelled' | 'failed';
  output?: Array<{
    id: string;
    type: 'message';
    role: string;
    content: Array<{
      type: 'output_text';
      text: string;
      annotations?: any[];
    }>;
  }>;
  output_text?: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface GPT5CallOptions {
  model?: string;
  instructions?: string;
  reasoning_effort?: 'low' | 'medium' | 'high';
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  background?: boolean;
  use_retry?: boolean;
  max_retries?: number;
  polling_interval?: number;
  max_polling_time?: number;
  tools?: Array<{
    type: 'web_search_preview' | 'file_search' | 'function';
    [key: string]: any;
  }>;
}

// Utility function to wait for a specified amount of time
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Utility function to poll response status
async function pollResponseStatus(
  apiKey: string, 
  responseId: string, 
  pollingInterval: number = 5000,
  maxPollingTime: number = 300000 // 5 minutes default
): Promise<GPT5Response> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxPollingTime) {
    try {
      const response = await fetch(`https://api.openai.com/v1/responses/${responseId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to get response status: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json() as GPT5Response;
      
      // Check if response is complete
      if (data.status === 'completed') {
        return data;
      }
      
      // Check for failure states
      if (data.status === 'failed' || data.status === 'cancelled' || data.status === 'incomplete') {
        throw new Error(`Response ${data.status}: ${responseId}`);
      }
      
      // Continue polling if queued or in_progress
      console.error(`Response ${responseId} status: ${data.status}, continuing to poll...`);
      await sleep(pollingInterval);
      
    } catch (error) {
      console.error('Error polling response status:', error);
      throw error;
    }
  }
  
  throw new Error(`Polling timeout after ${maxPollingTime}ms for response ${responseId}`);
}

// Enhanced retry wrapper with exponential backoff
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isSocketError = error instanceof Error && (
        error.message.includes('socket hang up') ||
        error.message.includes('ECONNRESET') ||
        error.message.includes('timeout')
      );
      
      if (attempt === maxRetries || !isSocketError) {
        throw error;
      }
      
      const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
      console.error(`Attempt ${attempt} failed, retrying in ${delay}ms...`, error.message);
      await sleep(delay);
    }
  }
  
  throw new Error('All retry attempts exhausted');
}

export async function callGPT5(
  apiKey: string,
  input: string,
  options: GPT5CallOptions = {}
): Promise<{ content: string; usage?: any }> {
  // Set defaults
  const opts = {
    model: 'gpt-5',
    use_retry: true,
    max_retries: 3,
    polling_interval: 5000,
    max_polling_time: 300000, // 5 minutes
    background: false,
    ...options
  };

  // Determine if we should use background processing
  // Auto-enable background for high reasoning effort to avoid timeouts
  const shouldUseBackground = opts.background || opts.reasoning_effort === 'high';

  const makeRequest = async (): Promise<{ content: string; usage?: any }> => {
    const requestBody: GPT5ResponseRequest = {
      model: opts.model || 'gpt-5',
      input,
      ...(opts.instructions && { instructions: opts.instructions }),
      ...(opts.reasoning_effort && { reasoning: { effort: opts.reasoning_effort } }),
      ...(opts.tools && { tools: opts.tools }),
      stream: false,
      background: shouldUseBackground
    };

    console.error('Making GPT-5 API request:', JSON.stringify({ ...requestBody, background: shouldUseBackground }, null, 2));

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GPT-5 API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json() as GPT5Response;
    
    // Handle background processing
    if (shouldUseBackground && data.id) {
      console.error(`Background response initiated with ID: ${data.id}, polling for completion...`);
      
      // Poll for completion
      const completedResponse = await pollResponseStatus(
        apiKey, 
        data.id, 
        opts.polling_interval, 
        opts.max_polling_time
      );
      
      console.error('Background response completed:', JSON.stringify(completedResponse, null, 2));
      
      return {
        content: completedResponse.output_text || 
                (completedResponse.output?.[0]?.content?.[0]?.text) || 
                JSON.stringify(completedResponse, null, 2),
        usage: completedResponse.usage
      };
    } else {
      // Synchronous response
      console.error('GPT-5 API response:', JSON.stringify(data, null, 2));
      
      return {
        content: data.output_text || (data.output?.[0]?.content?.[0]?.text) || JSON.stringify(data, null, 2),
        usage: data.usage
      };
    }
  };

  // Apply retry logic if enabled
  if (opts.use_retry) {
    return await withRetry(makeRequest, opts.max_retries);
  } else {
    return await makeRequest();
  }
}

export async function callGPT5WithMessages(
  apiKey: string,
  messages: Array<{
    role: 'user' | 'developer' | 'assistant';
    content: string | Array<{
      type: 'input_text' | 'input_image' | 'input_file';
      text?: string;
      image_url?: string;
      file_id?: string;
      file_url?: string;
    }>;
  }>,
  options: GPT5CallOptions = {}
): Promise<{ content: string; usage?: any }> {
  // Set defaults
  const opts = {
    model: 'gpt-5',
    use_retry: true,
    max_retries: 3,
    polling_interval: 5000,
    max_polling_time: 300000, // 5 minutes
    background: false,
    ...options
  };

  // Determine if we should use background processing
  // Auto-enable background for high reasoning effort to avoid timeouts
  const shouldUseBackground = opts.background || opts.reasoning_effort === 'high';

  const makeRequest = async (): Promise<{ content: string; usage?: any }> => {
    const requestBody: GPT5ResponseRequest = {
      model: opts.model || 'gpt-5',
      input: messages,
      ...(opts.instructions && { instructions: opts.instructions }),
      ...(opts.reasoning_effort && { reasoning: { effort: opts.reasoning_effort } }),
      ...(opts.tools && { tools: opts.tools }),
      stream: false,
      background: shouldUseBackground
    };

    console.error('Making GPT-5 API request with messages:', JSON.stringify({ ...requestBody, background: shouldUseBackground }, null, 2));

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GPT-5 API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json() as GPT5Response;
    
    // Handle background processing
    if (shouldUseBackground && data.id) {
      console.error(`Background response initiated with ID: ${data.id}, polling for completion...`);
      
      // Poll for completion
      const completedResponse = await pollResponseStatus(
        apiKey, 
        data.id, 
        opts.polling_interval, 
        opts.max_polling_time
      );
      
      console.error('Background response completed:', JSON.stringify(completedResponse, null, 2));
      
      return {
        content: completedResponse.output_text || 
                (completedResponse.output?.[0]?.content?.[0]?.text) || 
                JSON.stringify(completedResponse, null, 2),
        usage: completedResponse.usage
      };
    } else {
      // Synchronous response
      console.error('GPT-5 API response:', JSON.stringify(data, null, 2));
      
      return {
        content: data.output_text || (data.output?.[0]?.content?.[0]?.text) || JSON.stringify(data, null, 2),
        usage: data.usage
      };
    }
  };

  // Apply retry logic if enabled
  if (opts.use_retry) {
    return await withRetry(makeRequest, opts.max_retries);
  } else {
    return await makeRequest();
  }
}

