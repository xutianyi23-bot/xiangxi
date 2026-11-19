import Speech
import AVFoundation

// Keep the input tap running across recognition segments so a long meeting can continue.
final class MeetingMicrophone{
    private let engine=AVAudioEngine(),lock=NSLock()
    private var current:SFSpeechAudioBufferRecognitionRequest?
    private var tasks=[Int:SFSpeechRecognitionTask](),recognizer:SFSpeechRecognizer?,timer:Timer?
    private var token="",segment=0,tapped=false
    private var callback:(([String:Any])->Void)?
    func stop(){
        token="";timer?.invalidate();timer=nil
        if engine.isRunning{engine.stop()};if tapped{engine.inputNode.removeTap(onBus:0);tapped=false}
        lock.lock();current?.endAudio();current=nil;lock.unlock()
        for task in tasks.values{task.cancel()};tasks.removeAll();callback=nil
    }
    func start(token id:String,callback:@escaping([String:Any])->Void){
        stop();token=id;self.callback=callback;segment=0
        SFSpeechRecognizer.requestAuthorization{auth in
            AVCaptureDevice.requestAccess(for:.audio){allowed in DispatchQueue.main.async{
                guard self.token==id else{return}
                guard auth == .authorized,allowed,let r=SFSpeechRecognizer(locale:Locale(identifier:"zh-CN")),r.isAvailable else{self.fail("请在系统设置中允许麦克风与语音识别，并检查语音服务可用性。");return}
                self.recognizer=r
                let node=self.engine.inputNode,format=node.outputFormat(forBus:0)
                guard format.sampleRate>0,format.channelCount>0 else{self.fail("没有可用的麦克风。");return}
                self.rotate()
                node.installTap(onBus:0,bufferSize:2048,format:format){buffer,_ in
                    self.lock.lock();self.current?.append(buffer);self.lock.unlock()
                };self.tapped=true
                do{try self.engine.start()}catch{self.fail("无法打开麦克风。")}
            }}
        }
    }
    private func fail(_ text:String){callback?(["token":token,"error":text]);stop()}
    private func rotate(){
        guard !token.isEmpty,let recognizer else{return}
        timer?.invalidate()
        let id=token,request=SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults=true
        if recognizer.supportsOnDeviceRecognition{request.requiresOnDeviceRecognition=true}
        segment+=1;let part=segment
        lock.lock();let previous=current;current=request;previous?.endAudio();lock.unlock()
        tasks[part]=recognizer.recognitionTask(with:request){result,error in DispatchQueue.main.async{
            guard self.token==id else{return}
            if let text=result?.bestTranscription.formattedString,!text.isEmpty{
                self.callback?(["token":id,"segment":part,"text":text])
            }
            if result?.isFinal==true || error != nil{
                self.tasks.removeValue(forKey:part)
                if part==self.segment {
                    if let e=error as NSError?,e.code != 1110 && e.code != 216{self.fail("转写已中断，已识别的内容已保留。请检查语音服务后继续。")}
                    else{self.rotate()}
                }
            }
        }}
        timer=Timer.scheduledTimer(withTimeInterval:45,repeats:false){[weak self] _ in self?.rotate()}
    }
}
