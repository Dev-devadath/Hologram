import { createContext, useContext, useEffect, useState, useRef } from "react";

const backendUrl = "http://localhost:3000";
const USE_STREAMING = true; // Set to false to use standard mode

const SpeechContext = createContext();

export const SpeechProvider = ({ children }) => {
  const [recording, setRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState();
  const [loading, setLoading] = useState(false);
  const chunksRef = useRef([]);

  const initiateRecording = () => {
    chunksRef.current = [];
  };

  const onDataAvailable = (e) => {
    if (e.data && e.data.size > 0) {
      chunksRef.current.push(e.data);
    }
  };

  // Streaming handler for Server-Sent Events
  const handleStreamingResponse = async (response) => {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          // Process any remaining buffer
          if (buffer.trim()) {
            const lines = buffer.split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6));
                  if (data.message) {
                    setMessages((prev) => [...prev, data.message]);
                  }
                } catch (e) {
                  console.warn('Failed to parse final SSE data:', e);
                }
              }
            }
          }
          setLoading(false);
          break;
        }
        
        // Decode chunk and add to buffer
        buffer += decoder.decode(value, { stream: true });
        
        // Process complete lines
        const lines = buffer.split('\n');
        // Keep the last incomplete line in buffer
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine && trimmedLine.startsWith('data: ')) {
            try {
              const jsonStr = trimmedLine.slice(6);
              const data = JSON.parse(jsonStr);
              
              console.log('[Stream] 📨 Received SSE data:', {
                index: data.index,
                hasMessage: !!data.message,
                done: data.done,
                complete: data.complete
              });
              
              if (data.message) {
                // Add message immediately as it arrives - append to array
                setMessages((prev) => {
                  const newMessages = [...prev, data.message];
                  console.log('[Stream] ✅ Message', data.index, 'added to state. Total messages:', newMessages.length);
                  return newMessages;
                });
              }
              
              if (data.complete || data.done) {
                console.log('[Stream] 🏁 Stream complete');
                setLoading(false);
                return;
              }
            } catch (e) {
              console.error('❌ Failed to parse SSE data:', e);
              console.error('Raw line:', trimmedLine);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error reading stream:', error);
      setLoading(false);
      throw error;
    }
  };

  const sendAudioData = async (audioBlob) => {
    const reader = new FileReader();
    reader.readAsDataURL(audioBlob);
    reader.onloadend = async function () {
      const base64Audio = reader.result.split(",")[1];
      setLoading(true);
      // Clear previous messages when starting new request
      setMessages([]);
      try {
        if (USE_STREAMING) {
          // Streaming mode - faster first response
          const response = await fetch(`${backendUrl}/sts?stream=true`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Accept": "text/event-stream",
            },
            body: JSON.stringify({ audio: base64Audio }),
          });
          
          if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
          }
          
          await handleStreamingResponse(response);
        } else {
          // Standard mode - backward compatible
          const data = await fetch(`${backendUrl}/sts`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ audio: base64Audio }),
          });
          
          if (!data.ok) {
            const errorData = await data.json().catch(() => ({ error: "Unknown error" }));
            throw new Error(errorData.error || `Server error: ${data.status}`);
          }
          
          const response = await data.json();
          
          if (!response.messages || !Array.isArray(response.messages)) {
            throw new Error("Invalid response format from server");
          }
          
          setMessages((messages) => [...messages, ...response.messages]);
          setLoading(false);
        }
      } catch (error) {
        console.error("Error sending audio:", error);
        alert(`Error: ${error.message}`);
        setLoading(false);
      }
    };
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      // Check if MediaRecorder is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.error("MediaRecorder API not supported in this browser");
        alert("Your browser does not support audio recording. Please use a modern browser.");
        return;
      }

      navigator.mediaDevices
        .getUserMedia({ 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 48000,  // Higher quality input
            channelCount: 1     // Mono
          } 
        })
        .then((stream) => {
          // Determine the best MIME type supported by the browser
          let mimeType = "audio/webm;codecs=opus";
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
          }

          const options = mimeType ? { mimeType, audioBitsPerSecond: 128000 } : {};
          const newMediaRecorder = new MediaRecorder(stream, options);
          
          newMediaRecorder.onstart = initiateRecording;
          newMediaRecorder.ondataavailable = onDataAvailable;
          newMediaRecorder.onstop = async () => {
            const audioBlob = new Blob(chunksRef.current, { type: newMediaRecorder.mimeType || "audio/webm" });
            if (audioBlob.size > 0) {
              try {
                await sendAudioData(audioBlob);
              } catch (error) {
                console.error(error);
                alert(error.message);
              }
            } else {
              console.warn("No audio data recorded");
              alert("No audio was recorded. Please try again.");
            }
            chunksRef.current = [];
          };

          newMediaRecorder.onerror = (event) => {
            console.error("MediaRecorder error:", event.error);
            setRecording(false);
            alert("An error occurred while recording. Please try again.");
          };

          setMediaRecorder(newMediaRecorder);
        })
        .catch((err) => {
          console.error("Error accessing microphone:", err);
          if (err.name === "NotAllowedError") {
            alert("Microphone access denied. Please allow microphone access and refresh the page.");
          } else if (err.name === "NotFoundError") {
            alert("No microphone found. Please connect a microphone and try again.");
          } else {
            alert(`Error accessing microphone: ${err.message}`);
          }
        });
    }
  }, []);

  const startRecording = () => {
    if (mediaRecorder && mediaRecorder.state === "inactive") {
      try {
        chunksRef.current = [];
        // Start recording and request data every 100ms to ensure we capture all audio
        mediaRecorder.start(100);
        setRecording(true);
      } catch (error) {
        console.error("Error starting recording:", error);
        alert("Failed to start recording. Please try again.");
      }
    } else if (!mediaRecorder) {
      alert("Microphone not available. Please check your permissions.");
    } else if (mediaRecorder.state === "recording") {
      console.warn("Recording is already in progress");
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      try {
        mediaRecorder.stop();
        setRecording(false);
      } catch (error) {
        console.error("Error stopping recording:", error);
        alert("Failed to stop recording.");
      }
    }
  };

  const tts = async (message) => {
    setLoading(true);
    // Clear previous messages when starting new request
    setMessages([]);
    try {
      if (USE_STREAMING) {
        // Streaming mode - faster first response
        const response = await fetch(`${backendUrl}/tts?stream=true`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "text/event-stream",
          },
          body: JSON.stringify({ message }),
        });
        
        if (!response.ok) {
          throw new Error(`Server error: ${response.status}`);
        }
        
        await handleStreamingResponse(response);
      } else {
        // Standard mode - backward compatible
        const data = await fetch(`${backendUrl}/tts`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ message }),
        });
        const response = (await data.json()).messages;
        setMessages((messages) => [...messages, ...response]);
        setLoading(false);
      }
    } catch (error) {
      console.error(error);
      setLoading(false);
    }
  };

  const onMessagePlayed = () => {
    setMessages((messages) => messages.slice(1));
  };

  useEffect(() => {
    if (messages.length > 0) {
      setMessage(messages[0]);
    } else {
      setMessage(null);
    }
  }, [messages]);

  return (
    <SpeechContext.Provider
      value={{
        startRecording,
        stopRecording,
        recording,
        tts,
        message,
        onMessagePlayed,
        loading,
      }}
    >
      {children}
    </SpeechContext.Provider>
  );
};

export const useSpeech = () => {
  const context = useContext(SpeechContext);
  if (!context) {
    throw new Error("useSpeech must be used within a SpeechProvider");
  }
  return context;
};
