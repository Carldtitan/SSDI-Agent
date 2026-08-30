"use client";

/**
 * Guava browser voice session (WebRTC).
 *
 * Guava's documented browser integration is a drop-in `<script>` widget
 * (`https://app.goguava.ai/static/build/webrtc-widgets/guava-widget.js`) that
 * injects its own orb UI, its own CSS and its own chat panel. SSDI Agent is an
 * accessibility-first app with its own orb, its own live regions and its own
 * turn-taking state machine, so we cannot hand the screen over to Guava's
 * widget. Instead this module speaks the exact same protocol that widget
 * speaks, so the whole voice path stays Guava:
 *
 *   1. Signaling WebSocket: `wss://app.goguava.ai/webrtc/`
 *      - send    { type: "auth", body: <webrtc code | JSON with metadata> }
 *      - receive { type: "auth", body: "OK", resume_token, ice_servers }
 *      - send    { type: "connect", body: {} }
 *      - SDP/ICE trickle over { type: "desc" } / { type: "candidate" }
 *      - { type: "hangup" | "reset" | "error" }
 *   2. Transcript side-channel: `wss://app.goguava.ai/webrtc-chat/`
 *      - send    { webrtc_code, chat_session_id } on open
 *      - receive { event_type: "agent-speech" | "caller-speech",
 *                  utterance, utterance_id }
 *      - send    { type: "user-text", text } to inject text into the call
 *
 * Both directions are Guava: Guava runs speech-to-text on the uplink and Guava
 * runs text-to-speech on the downlink. Guava owns the whole pipeline.
 */

export const GUAVA_APP_BASE_URL =
  process.env.NEXT_PUBLIC_GUAVA_APP_URL ?? "https://app.goguava.ai";

export type GuavaUtterance = {
  id: string;
  role: "agent" | "caller";
  text: string;
};

export type GuavaSessionConfig = {
  chatUrl: string;
  socketUrl: string;
  webrtcCode: string;
};

export type GuavaSessionCallbacks = {
  onAgentSpeech?: (utterance: GuavaUtterance) => void;
  onCallerSpeech?: (utterance: GuavaUtterance) => void;
  onConnected?: (stream: MediaStream) => void;
  onEnded?: () => void;
  onError?: (message: string) => void;
  onLevel?: (level: number) => void;
};

export type GuavaVoiceSession = {
  close: () => void;
  connect: () => Promise<void>;
  isConnected: () => boolean;
  sendText: (text: string) => void;
  setMuted: (muted: boolean) => void;
};

type SignalMessage = {
  body?: unknown;
  ice_servers?: RTCIceServer[];
  resume_token?: string;
  type?: string;
};

type ChatMessage = {
  event_type?: string;
  type?: string;
  utterance?: string;
  utterance_id?: string;
};

const CONNECT_TIMEOUT_MS = 15_000;

export function createGuavaVoiceSession(
  config: GuavaSessionConfig,
  callbacks: GuavaSessionCallbacks,
): GuavaVoiceSession {
  let socket: WebSocket | null = null;
  let chatSocket: WebSocket | null = null;
  let peer: RTCPeerConnection | null = null;
  let localStream: MediaStream | null = null;
  let remoteAudio: HTMLAudioElement | null = null;
  let audioContext: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let levelFrame: number | null = null;
  let iceServers: RTCIceServer[] | undefined;
  let muted = true;
  let connected = false;
  let closed = false;

  const chatSessionId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `ssdi-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const send = (message: unknown) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  };

  const stopLevelMeter = () => {
    if (levelFrame !== null) {
      cancelAnimationFrame(levelFrame);
      levelFrame = null;
    }
    analyser = null;
    if (audioContext) {
      void audioContext.close().catch(() => {});
      audioContext = null;
    }
    callbacks.onLevel?.(0);
  };

  // Mirrors the Guava widget's own analyser so the SSDI Agent orb keeps the
  // same feel: fftSize 256, fast attack, slow release.
  const startLevelMeter = (stream: MediaStream) => {
    if (typeof AudioContext === "undefined") return;
    stopLevelMeter();
    try {
      audioContext = new AudioContext();
      if (audioContext.state === "suspended") void audioContext.resume();
      const source = audioContext.createMediaStreamSource(stream);
      const node = audioContext.createAnalyser();
      node.fftSize = 256;
      node.smoothingTimeConstant = 0.4;
      source.connect(node);
      analyser = node;
      const data = new Uint8Array(node.frequencyBinCount);
      let smoothed = 0;
      const tick = () => {
        if (!analyser) return;
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let index = 0; index < data.length; index += 1) sum += data[index];
        const raw = muted ? 0 : sum / data.length / 255;
        smoothed += (raw - smoothed) * (raw > smoothed ? 0.6 : 0.15);
        callbacks.onLevel?.(Math.min(1, Math.max(0, smoothed)));
        levelFrame = requestAnimationFrame(tick);
      };
      levelFrame = requestAnimationFrame(tick);
    } catch {
      stopLevelMeter();
    }
  };

  const teardownMedia = () => {
    stopLevelMeter();
    if (peer) {
      peer.close();
      peer = null;
    }
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      localStream = null;
    }
    if (remoteAudio) {
      remoteAudio.srcObject = null;
      remoteAudio.remove();
      remoteAudio = null;
    }
  };

  const closeSession = () => {
    if (closed) return;
    closed = true;
    connected = false;
    teardownMedia();
    if (chatSocket) {
      chatSocket.onclose = null;
      chatSocket.onerror = null;
      chatSocket.close();
      chatSocket = null;
    }
    if (socket) {
      socket.onclose = null;
      socket.onerror = null;
      socket.close();
      socket = null;
    }
  };

  const fail = (message: string) => {
    if (closed) return;
    closeSession();
    callbacks.onError?.(message);
  };

  const attachRemoteAudio = (stream: MediaStream) => {
    if (!remoteAudio) {
      remoteAudio = document.createElement("audio");
      remoteAudio.autoplay = true;
      remoteAudio.setAttribute("aria-hidden", "true");
      remoteAudio.style.display = "none";
      document.body.appendChild(remoteAudio);
    }
    remoteAudio.srcObject = stream;
    void remoteAudio.play().catch(() => {
      // Autoplay can be blocked until the first gesture. Voice is always
      // started from a button press, so this is rare and non-fatal.
    });
  };

  const createAndSendOffer = async () => {
    if (!peer) return;
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    send({ body: peer.localDescription, type: "desc" });
  };

  const startPeerConnection = async (onLive: () => void) => {
    const connection = new RTCPeerConnection({
      iceServers: iceServers ?? [
        {
          urls: [
            "stun:stun.l.google.com:19302",
            "stun:stun.sipgate.net:10000",
          ],
        },
      ],
    });
    peer = connection;

    connection.onicecandidate = (event) => {
      if (event.candidate) send({ body: event.candidate, type: "candidate" });
    };
    connection.onnegotiationneeded = () => {
      void createAndSendOffer().catch(() => {
        fail("Guava could not negotiate the voice connection.");
      });
    };
    connection.ontrack = (event) => {
      const stream = event.streams[0];
      if (!stream) return;
      attachRemoteAudio(stream);
      if (!connected) {
        connected = true;
        callbacks.onConnected?.(stream);
        onLive();
      }
    };

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
    } catch {
      throw new Error(
        "We could not use the microphone. Allow microphone access, or type your answer instead.",
      );
    }
    if (closed) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    localStream = stream;
    stream.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
      connection.addTrack(track, stream);
    });
    startLevelMeter(stream);
  };

  const connectChatSocket = () => {
    const chat = new WebSocket(config.chatUrl);
    chatSocket = chat;
    chat.onopen = () => {
      chat.send(
        JSON.stringify({
          chat_session_id: chatSessionId,
          webrtc_code: config.webrtcCode,
        }),
      );
    };
    chat.onmessage = (event) => {
      let payload: ChatMessage;
      try {
        payload = JSON.parse(String(event.data)) as ChatMessage;
      } catch {
        return;
      }
      if (payload.type === "ready") return;
      const utterance: GuavaUtterance = {
        id: payload.utterance_id ?? "",
        role: payload.event_type === "agent-speech" ? "agent" : "caller",
        text: payload.utterance ?? "",
      };
      if (payload.event_type === "agent-speech") {
        callbacks.onAgentSpeech?.(utterance);
      } else if (payload.event_type === "caller-speech") {
        callbacks.onCallerSpeech?.(utterance);
      }
    };
    chat.onerror = () => {
      // This side-channel carries every transcript. Without it we cannot read
      // an answer back, so surface the failure and let the caller fall back to
      // typed input rather than stranding the applicant on a silent mic.
      fail(
        "The Guava transcript channel dropped. Start voice again, or type your answer.",
      );
    };
    chat.onclose = () => {
      if (connected) {
        fail(
          "The Guava voice session ended. Start voice again to continue, or type your answer.",
        );
      }
    };
  };

  const handleSignal = async (
    message: SignalMessage,
    finish: (problem?: Error) => void,
  ) => {
    switch (message.type) {
      case "auth": {
        if (message.body !== "OK") {
          const problem = new Error(
            "Guava rejected the voice session code. Refresh and try again.",
          );
          finish(problem);
          fail(problem.message);
          return;
        }
        iceServers = message.ice_servers;
        send({ body: {}, type: "connect" });
        try {
          await startPeerConnection(() => finish());
        } catch (problem) {
          const error =
            problem instanceof Error
              ? problem
              : new Error("Guava could not open the microphone.");
          finish(error);
          fail(error.message);
        }
        return;
      }
      case "desc": {
        const description = message.body as RTCSessionDescriptionInit | null;
        if (description && description.type === "answer" && peer) {
          await peer.setRemoteDescription(
            new RTCSessionDescription(description),
          );
        }
        return;
      }
      case "candidate": {
        const candidate = message.body as RTCIceCandidateInit | null;
        if (candidate && peer) {
          await peer
            .addIceCandidate(new RTCIceCandidate(candidate))
            .catch(() => {});
        }
        return;
      }
      case "hangup":
      case "reset": {
        closeSession();
        callbacks.onEnded?.();
        return;
      }
      case "error": {
        const problem = new Error(
          "Guava reported a voice error. Try again, or type your answer.",
        );
        finish(problem);
        fail(problem.message);
        return;
      }
      default:
        return;
    }
  };

  const connect = () =>
    new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (problem?: Error) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        if (problem) reject(problem);
        else resolve();
      };
      const timer = window.setTimeout(() => {
        finish(new Error("Guava did not connect the voice session."));
        closeSession();
      }, CONNECT_TIMEOUT_MS);

      // The transcript channel must be bound to the same chat_session_id that
      // the media leg authenticates with, exactly as the Guava widget does.
      connectChatSocket();

      const signaling = new WebSocket(config.socketUrl);
      socket = signaling;
      signaling.onopen = () => {
        send({
          body: JSON.stringify({
            chat_session_id: chatSessionId,
            webrtc_code: config.webrtcCode,
          }),
          type: "auth",
        });
      };
      signaling.onerror = () => {
        const message = "Guava voice is unreachable. Check your connection.";
        finish(new Error(message));
        fail(message);
      };
      signaling.onclose = () => {
        socket = null;
        finish(
          new Error("Guava closed the voice session before it started."),
        );
      };
      signaling.onmessage = (event) => {
        let message: SignalMessage;
        try {
          message = JSON.parse(String(event.data)) as SignalMessage;
        } catch {
          return;
        }
        void handleSignal(message, finish);
      };
    });

  return {
    close: () => {
      const wasConnected = connected;
      closeSession();
      if (wasConnected) callbacks.onEnded?.();
    },
    connect,
    isConnected: () => connected && !closed,
    sendText: (text: string) => {
      if (chatSocket && chatSocket.readyState === WebSocket.OPEN) {
        chatSocket.send(JSON.stringify({ text, type: "user-text" }));
      }
    },
    setMuted: (next: boolean) => {
      muted = next;
      localStream?.getAudioTracks().forEach((track) => {
        track.enabled = !next;
      });
      if (next) callbacks.onLevel?.(0);
    },
  };
}
