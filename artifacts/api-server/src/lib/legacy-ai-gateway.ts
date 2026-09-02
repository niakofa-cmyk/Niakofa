/**
 * Legacy AI Gateway — resilient, privacy-safe choke point for Legacy Engine AI.
 * Prompts and completions are intentionally never written to logs or metrics.
 */
import Anthropic from "@anthropic-ai/sdk";
import { logger } from "./logger";

export const DEFAULT_LEGACY_AI_MODEL = "claude-3-5-haiku-20241022";
const ALLOWED_MODELS = new Set(["claude-3-5-haiku-20241022","claude-3-5-sonnet-20241022","claude-3-7-sonnet-latest"]);
const DEFAULT_TIMEOUT_MS = 15_000, DEFAULT_MAX_RETRIES = 2, CIRCUIT_FAILURE_THRESHOLD = 5, CIRCUIT_OPEN_MS = 30_000;
function positiveInt(v:string|undefined,f:number,max:number){const n=Number(v);return Number.isInteger(n)&&n>0&&n<=max?n:f;}
export function getLegacyAIModel():string{const m=process.env.LEGACY_AI_MODEL?.trim();if(!m)return DEFAULT_LEGACY_AI_MODEL;if(ALLOWED_MODELS.has(m))return m;logger.warn({configuredModel:m},"legacy-ai-gateway: invalid model configuration; using default");return DEFAULT_LEGACY_AI_MODEL;}
let client:Anthropic|null=null; function getClient(){return client??(client=new Anthropic());}
export interface LegacyAIRequest{system:string;userPrompt:string;maxTokens?:number;}
export interface LegacyAIResponse{content:string;model:string;metadata:Record<string,unknown>;}
let failures=0,openedAt=0,probe=false;
const metrics={requests:0,successes:0,failures:0,fallbacks:0,retries:0,timeouts:0,inputTokens:0,outputTokens:0,totalLatencyMs:0};
export function getLegacyAIMetrics():Readonly<typeof metrics>{return {...metrics};}
export function __resetLegacyAIGatewayForTests(){client=null;failures=0;openedAt=0;probe=false;for(const k of Object.keys(metrics) as Array<keyof typeof metrics>)metrics[k]=0;}
function state(){if(failures<CIRCUIT_FAILURE_THRESHOLD)return "closed";return Date.now()-openedAt<CIRCUIT_OPEN_MS?"open":"half_open";}
function canAttempt(){const s=state();if(s==="closed")return true;if(s==="open"||probe)return false;probe=true;return true;}
function success(){failures=0;openedAt=0;probe=false;} function failure(){failures++;if(failures>=CIRCUIT_FAILURE_THRESHOLD)openedAt=Date.now();probe=false;}
function status(e:unknown){return typeof e==="object"&&e!==null&&typeof (e as {status?:unknown}).status==="number"?(e as {status:number}).status:undefined;}
function retryable(e:unknown){const s=status(e);return s===408||s===409||s===429||(s!==undefined&&s>=500);}
function fallback(reason:string):LegacyAIResponse{metrics.fallbacks++;logger.warn({reason,circuit:state()},"legacy-ai-gateway: using fallback");return{content:"",model:"fallback",metadata:{reason}};}
const sleep=(ms:number)=>new Promise<void>(r=>setTimeout(r,ms));

class LegacyAIGateway{
 async generate(req:LegacyAIRequest):Promise<LegacyAIResponse>{
  metrics.requests++;const started=Date.now(),model=getLegacyAIModel(),maxTokens=req.maxTokens??400;
  const timeoutMs=positiveInt(process.env.LEGACY_AI_TIMEOUT_MS,DEFAULT_TIMEOUT_MS,60_000),maxRetries=positiveInt(process.env.LEGACY_AI_MAX_RETRIES,DEFAULT_MAX_RETRIES,3);
  if(!canAttempt())return fallback("circuit_open");
  for(let attempt=0;attempt<=maxRetries;attempt++){
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
   try{
    const response=await getClient().messages.create({model,max_tokens:maxTokens,system:req.system,messages:[{role:"user",content:req.userPrompt}]},{signal:controller.signal});
    clearTimeout(timer);
    const content=response.content.filter((b):b is Anthropic.TextBlock=>b.type==="text").map(b=>b.text).join("");
    metrics.successes++;metrics.totalLatencyMs+=Date.now()-started;metrics.inputTokens+=response.usage.input_tokens??0;metrics.outputTokens+=response.usage.output_tokens??0;success();
    logger.info({model,attempt,latencyMs:Date.now()-started,inputTokens:response.usage.input_tokens??0,outputTokens:response.usage.output_tokens??0},"legacy-ai-gateway: request completed");
    return{content,model,metadata:{stop_reason:response.stop_reason,usage:response.usage,attempts:attempt+1}};
   }catch(err){
    clearTimeout(timer);const timedOut=controller.signal.aborted;if(timedOut)metrics.timeouts++;
    if(attempt<maxRetries&&(timedOut||retryable(err))){metrics.retries++;await sleep(100*2**attempt);continue;}
    metrics.failures++;metrics.totalLatencyMs+=Date.now()-started;failure();logger.warn({model,attempt,status:status(err),timedOut,circuit:state()},"legacy-ai-gateway: AI call failed");return fallback(timedOut?"timeout":"provider_error");
   }
  }return fallback("retry_exhausted");
 }
}
export const legacyAI=new LegacyAIGateway();