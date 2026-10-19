// Executado em Worker Thread para não bloquear o Electron durante a inferência.
export const voiceWorkerScript = String.raw`
const { parentPort, workerData } = require('node:worker_threads')
const { join } = require('node:path')
let addon, recognizer, tts
function load() { return addon ||= require(workerData.modulePath) }
function encode(samples, sampleRate) {
  const bytes = new Uint8Array(44 + samples.length * 2), view = new DataView(bytes.buffer)
  const str=(n,s)=>{for(let j=0;j<s.length;j++) view.setUint8(n+j,s.charCodeAt(j))}
  str(0,'RIFF');view.setUint32(4,bytes.length-8,true);str(8,'WAVE')
  str(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true)
  view.setUint16(22,1,true);view.setUint32(24,sampleRate,true)
  view.setUint32(28,sampleRate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true)
  str(36,'data');view.setUint32(40,samples.length*2,true)
  for(let i=0;i<samples.length;i++){const v=Math.max(-1,Math.min(1,samples[i]));view.setInt16(44+i*2,v<0?v*32768:v*32767,true)}
  return bytes
}
parentPort.on('message',async message=>{
  try{
    const sherpa=load()
    const base=workerData.modelsDir
    if(message.operation==='transcribe'){
      if(!recognizer){
        const dir=join(base,'sherpa-onnx-whisper-tiny')
        recognizer=new sherpa.OfflineRecognizer({
          featConfig:{sampleRate:16000,featureDim:80},
          modelConfig:{
            whisper:{encoder:join(dir,'tiny-encoder.int8.onnx'),decoder:join(dir,'tiny-decoder.int8.onnx'),language:'pt',task:'transcribe'},
            tokens:join(dir,'tiny-tokens.txt'),
            numThreads:2,provider:'cpu',debug:false
          }
        })
      }
      const stream=recognizer.createStream()
      stream.acceptWaveform({samples:message.samples,sampleRate:16000})
      recognizer.decode(stream)
      const result=recognizer.getResult(stream)
      parentPort.postMessage({id:message.id,text:String(result.text||'').trim()})
    } else if(message.operation==='speak'){
      if(!tts){
        const dir=join(base,'vits-piper-pt_BR-dii-high')
        tts=new sherpa.OfflineTts({
          model:{vits:{model:join(dir,'pt_BR-dii-high.onnx'),tokens:join(dir,'tokens.txt'),dataDir:join(dir,'espeak-ng-data')},
            numThreads:2,provider:'cpu',debug:false},maxNumSentences:1
        })
      }
      // A API generationConfig ignora enableExternalBuffer em algumas versões do addon.
      // A API clássica do sherpa-onnx aceita o controle explícito sem buffers externos,
      // necessários para compatibilidade com o Electron.
      const generated=tts.generate({text:message.text,sid:0,speed:message.speed||1,enableExternalBuffer:false})
      const wav=encode(generated.samples,generated.sampleRate)
      parentPort.postMessage({id:message.id,wav},[wav.buffer])
    }
  }catch(error){parentPort.postMessage({id:message.id,error:String(error?.message||error)})}
})
`