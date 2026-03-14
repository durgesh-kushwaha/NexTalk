class WebRTCManager {
  constructor() {
    this.peerConnection = null;
    this.localStream = null;
    this.remoteStream = null;
    this.callPartner = null;
    this.isVideoCall = false;
    this.isMuted = false;
    this.isCameraOff = false;
    this.isSpeakerOn = false;
    this.timerId = null;
    this.callStartedAt = null;
    this.pendingIceCandidates = [];
    this.callInProgress = false;
    this.currentFacingMode = 'user';
    this.ringtoneContext = null;
    this.ringtoneTimer = null;
    this.audioUnlocked = false;
    this.callPartnerDisplayName = null;
    this.callPartnerAvatarUrl = '';
    this.selectedAudioOutputId = '';
    this.lastIncomingCallFrom = '';
    this.lastIncomingCallAt = 0;
    this.incomingRingLocked = false;

    this.iceConfig = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
      ],
    };

    this.overlay = document.getElementById('call-overlay');
    this.notification = document.getElementById('call-notification');
    this.notifName = document.getElementById('call-notif-name');
    this.notifType = document.getElementById('call-notif-type');
    this.remoteVideo = document.getElementById('remote-video');
    this.localVideo = document.getElementById('local-video');
    this.partnerLabel = document.getElementById('call-partner-display');
    this.callStateLabel = document.getElementById('call-state-text');
    this.timerLabel = document.getElementById('call-timer');
    this.audioCallVisual = document.getElementById('audio-call-visual');
    this.audioCallAvatarImage = document.getElementById('audio-call-avatar-image');
    this.audioCallAvatarFallback = document.getElementById('audio-call-avatar-fallback');
    this.btnToggleCamera = document.getElementById('btn-toggle-camera');
    this.btnSwitchCamera = document.getElementById('btn-switch-camera');
    this.btnAddParticipant = document.getElementById('btn-add-participant');
    this.audioOutputWrap = document.getElementById('audio-output-wrap');
    this.audioOutputSelect = document.getElementById('audio-output-select');
    this.requestTimeoutId = null;
    this.callRequestRetryTimer = null;
    this.callRequestRetried = false;
    this.remoteAudio = new Audio();
    this.remoteAudio.autoplay = true;
    this.remoteAudio.playsInline = true;
    this.remoteAudio.muted = false;
    this.remoteVideo.style.transform = 'scaleX(-1)';
    this.remoteVideo.style.webkitTransform = 'scaleX(-1)';
    this.localVideo.addEventListener('click', () => {
      if (this.isMobileDevice()) {
        return;
      }
      this.localVideo.classList.toggle('expanded');
    });

    document.getElementById('accept-call-btn').addEventListener('click', () => this.acceptCall());
    document.getElementById('reject-call-btn').addEventListener('click', () => this.rejectCall());
    document.getElementById('btn-toggle-mute').addEventListener('click', () => this.toggleMute());
    this.btnToggleCamera.addEventListener('click', () => this.handleThirdControl());
    this.btnSwitchCamera.addEventListener('click', () => this.switchCamera());
    if (this.btnAddParticipant) {
      this.btnAddParticipant.addEventListener('click', () => this.inviteParticipant());
    }
    document.getElementById('btn-end-call').addEventListener('click', () => this.endCall());
    if (this.audioOutputSelect) {
      this.audioOutputSelect.addEventListener('change', async (event) => {
        await this.selectAudioOutput(event.target.value);
      });
    }

    const unlockAudio = () => {
      this.ensureRingtoneContext();
      this.audioUnlocked = true;
      document.removeEventListener('pointerdown', unlockAudio);
      document.removeEventListener('keydown', unlockAudio);
    };
    document.addEventListener('pointerdown', unlockAudio, { once: true });
    document.addEventListener('keydown', unlockAudio, { once: true });
  }

  isMobileDevice() {
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  }

  updateLocalPreviewTransform() {
    const mirror = this.currentFacingMode === 'user';
    const value = mirror ? 'scaleX(-1)' : 'none';
    this.localVideo.style.transform = value;
    this.localVideo.style.webkitTransform = value;
  }

  setControlLabel(buttonId, icon, text) {
    const button = document.getElementById(buttonId);
    button.innerHTML = `<span class="material-symbols-rounded">${icon}</span><span>${text}</span>`;
  }

  updateAndroidVideoCallState(active) {
    if (typeof window.AndroidBridge === 'undefined') {
      return;
    }
    if (typeof window.AndroidBridge.setVideoCallState !== 'function') {
      return;
    }
    try {
      window.AndroidBridge.setVideoCallState(!!active);
    } catch (error) {
    }
  }

  notifyAndroidCallAudioStart() {
    if (typeof window.AndroidBridge === 'undefined') {
      return;
    }
    if (typeof window.AndroidBridge.onCallAudioStart !== 'function') {
      return;
    }
    try {
      window.AndroidBridge.onCallAudioStart();
    } catch (error) {
    }
  }

  notifyAndroidCallAudioEnd() {
    if (typeof window.AndroidBridge === 'undefined') {
      return;
    }
    if (typeof window.AndroidBridge.onCallAudioEnd !== 'function') {
      return;
    }
    try {
      window.AndroidBridge.onCallAudioEnd();
    } catch (error) {
    }
  }

  ensureRingtoneContext() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) {
      return null;
    }
    if (!this.ringtoneContext) {
      this.ringtoneContext = new AudioCtx();
    }
    if (this.ringtoneContext.state === 'suspended') {
      this.ringtoneContext.resume().catch(() => {});
    }
    return this.ringtoneContext;
  }

  startNativeIncomingRingtone() {
    if (typeof window.AndroidBridge === 'undefined') {
      return false;
    }
    if (typeof window.AndroidBridge.startIncomingRingtone !== 'function') {
      return false;
    }
    try {
      window.AndroidBridge.startIncomingRingtone();
      return true;
    } catch (error) {
      return false;
    }
  }

  stopNativeIncomingRingtone() {
    if (typeof window.AndroidBridge === 'undefined') {
      return;
    }
    if (typeof window.AndroidBridge.stopIncomingRingtone !== 'function') {
      return;
    }
    try {
      window.AndroidBridge.stopIncomingRingtone();
    } catch (error) {
    }
  }

  playRingtoneBurst() {
    const ctx = this.ensureRingtoneContext();
    if (!ctx) {
      return;
    }

    const beep = (delaySeconds, frequency) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = frequency;
      gain.gain.value = 0.0001;
      osc.connect(gain);
      gain.connect(ctx.destination);

      const start = ctx.currentTime + delaySeconds;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.22, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);
      osc.start(start);
      osc.stop(start + 0.3);
    };

    beep(0, 860);
    beep(0.28, 980);
    beep(0.56, 860);
  }

  startIncomingRingtone() {
    const nativeStarted = this.startNativeIncomingRingtone();
    if (nativeStarted) {
      return;
    }

    if (this.ringtoneTimer) {
      return;
    }
    if (!this.audioUnlocked) {
      this.ensureRingtoneContext();
    }
    this.playRingtoneBurst();
    this.ringtoneTimer = setInterval(() => {
      this.playRingtoneBurst();
    }, 1200);
  }

  stopIncomingRingtone() {
    this.stopNativeIncomingRingtone();

    if (this.ringtoneTimer) {
      clearInterval(this.ringtoneTimer);
      this.ringtoneTimer = null;
    }
  }

  setCallTarget(username, displayName, avatarUrl) {
    this.callPartner = username || null;
    this.callPartnerDisplayName = displayName || username || null;
    this.callPartnerAvatarUrl = avatarUrl || '';
    this.applyAudioAvatar();
  }

  getInitial(name) {
    const value = String(name || '').trim();
    return value ? value.slice(0, 1).toUpperCase() : '?';
  }

  applyAudioAvatar() {
    if (!this.audioCallAvatarImage || !this.audioCallAvatarFallback) {
      return;
    }
    const title = this.callPartnerDisplayName || this.callPartner || 'Call';
    this.audioCallAvatarFallback.textContent = this.getInitial(title);
    const src = String(this.callPartnerAvatarUrl || '').trim();
    if (!src) {
      this.audioCallAvatarImage.hidden = true;
      this.audioCallAvatarImage.removeAttribute('src');
      this.audioCallAvatarFallback.hidden = false;
      return;
    }
    this.audioCallAvatarImage.src = src;
    this.audioCallAvatarImage.hidden = false;
    this.audioCallAvatarFallback.hidden = true;
  }

  applyCallModeClass() {
    if (!this.overlay) {
      return;
    }
    this.overlay.classList.toggle('audio-mode', !this.isVideoCall);
    this.updateCallControlsForMode();
  }

  updateCallControlsForMode() {
    if (this.isVideoCall) {
      this.setControlLabel('btn-toggle-camera', this.isCameraOff ? 'videocam_off' : 'videocam', this.isCameraOff ? 'Camera Off' : 'Camera');
      this.btnSwitchCamera.hidden = false;
      if (this.audioOutputWrap) {
        this.audioOutputWrap.hidden = true;
      }
      return;
    }

    this.setControlLabel('btn-toggle-camera', this.isSpeakerOn ? 'volume_up' : 'hearing', this.isSpeakerOn ? 'Speaker On' : 'Speaker Off');
    this.btnSwitchCamera.hidden = true;
    this.refreshAudioOutputOptions();
  }

  mapAudioOutputLabel(device) {
    if (!device) {
      return 'Output';
    }
    const label = String(device.label || '').trim();
    if (label) {
      return label;
    }
    const kind = String(device.kind || '').toLowerCase();
    if (kind.includes('bluetooth') || kind.includes('bt')) {
      return 'Bluetooth';
    }
    if (kind.includes('speaker')) {
      return 'Speaker';
    }
    if (kind.includes('earpiece')) {
      return 'Phone';
    }
    if (kind.includes('wired') || kind.includes('head')) {
      return 'Wired headset';
    }
    return 'Output';
  }

  getAndroidOutputDevices() {
    if (typeof window.AndroidBridge === 'undefined') {
      return [];
    }
    if (typeof window.AndroidBridge.getAudioOutputDevices !== 'function') {
      return [];
    }
    try {
      const raw = window.AndroidBridge.getAudioOutputDevices();
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.map((item) => ({
        id: String(item.id || ''),
        label: this.mapAudioOutputLabel(item),
        selected: !!item.selected,
      })).filter((item) => !!item.id);
    } catch (error) {
      return [];
    }
  }

  async getBrowserOutputDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) {
      return [];
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices
        .filter((item) => item.kind === 'audiooutput')
        .map((item, index) => ({
          id: item.deviceId || `default-${index}`,
          label: item.label || `Output ${index + 1}`,
          selected: item.deviceId === this.selectedAudioOutputId,
        }));
    } catch (error) {
      return [];
    }
  }

  renderAudioOutputOptions(devices) {
    if (!this.audioOutputWrap || !this.audioOutputSelect) {
      return;
    }
    if (!devices.length) {
      this.audioOutputWrap.hidden = true;
      return;
    }

    this.audioOutputSelect.innerHTML = '';
    devices.forEach((device) => {
      const option = document.createElement('option');
      option.value = String(device.id);
      option.textContent = this.mapAudioOutputLabel(device);
      this.audioOutputSelect.appendChild(option);
    });

    const selected = devices.find((item) => item.selected) || devices[0];
    this.selectedAudioOutputId = selected.id;
    this.audioOutputSelect.value = selected.id;
    this.audioOutputWrap.hidden = false;
  }

  async refreshAudioOutputOptions() {
    if (this.isVideoCall) {
      if (this.audioOutputWrap) {
        this.audioOutputWrap.hidden = true;
      }
      return;
    }

    const androidDevices = this.getAndroidOutputDevices();
    if (androidDevices.length) {
      this.renderAudioOutputOptions(androidDevices);
      return;
    }

    const browserDevices = await this.getBrowserOutputDevices();
    this.renderAudioOutputOptions(browserDevices);
  }

  async selectAudioOutput(deviceId) {
    const target = String(deviceId || '').trim();
    if (!target) {
      return;
    }

    this.selectedAudioOutputId = target;

    if (typeof window.AndroidBridge !== 'undefined' && typeof window.AndroidBridge.setAudioOutputDevice === 'function') {
      try {
        const applied = !!window.AndroidBridge.setAudioOutputDevice(target);
        if (!applied) {
          this.flash('Could not switch output');
        }
        return;
      } catch (error) {
        this.flash('Could not switch output');
        return;
      }
    }

    if (typeof this.remoteAudio.setSinkId === 'function') {
      try {
        await this.remoteAudio.setSinkId(target);
      } catch (error) {
        this.flash('Output selection not supported');
      }
    }
  }

  async applySpeakerMode() {
    if (this.isVideoCall || !this.remoteAudio) {
      return;
    }

    if (typeof this.remoteAudio.setSinkId === 'function') {
      const targetSink = this.isSpeakerOn ? 'default' : 'communications';
      try {
        await this.remoteAudio.setSinkId(targetSink);
      } catch (error) {
        if (!this.isSpeakerOn) {
          try {
            await this.remoteAudio.setSinkId('default');
          } catch (fallbackError) {
          }
        }
      }
    }

    this.remoteAudio.volume = this.isSpeakerOn ? 1 : 0.75;
    try {
      await this.remoteAudio.play();
    } catch (error) {
    }

    if (this.selectedAudioOutputId) {
      await this.selectAudioOutput(this.selectedAudioOutputId);
    }
  }

  async initiateCall(videoEnabled) {
    if (this.callInProgress) {
      this.flash('Call already active');
      return;
    }

    if (!this.callPartner) {
      this.flash('Select a private conversation first');
      return;
    }

    try {
      await this.setupMedia(videoEnabled);
    } catch (error) {
      this.flash(videoEnabled ? 'Allow microphone and camera to start video call' : 'Allow microphone to start audio call');
      return;
    }

    const sent = window.sendSignal({
      type: 'CALL_REQUEST',
      toUsername: this.callPartner,
      videoEnabled,
    });
    if (!sent) {
      return;
    }

    this.isVideoCall = !!videoEnabled;
    this.applyCallModeClass();
    this.applyAudioAvatar();
    this.callInProgress = true;
    this.partnerLabel.textContent = this.callPartnerDisplayName || this.callPartner;
    this.callStateLabel.textContent = 'Ringing...';
    this.overlay.classList.add('open');
    this.updateAndroidVideoCallState(this.isVideoCall);
    this.requestTimeoutId = setTimeout(() => {
      this.flash('No response from user');
      this.cleanup();
    }, 25000);

    if (this.callRequestRetryTimer) {
      clearTimeout(this.callRequestRetryTimer);
    }
    this.callRequestRetried = false;
    this.callRequestRetryTimer = setTimeout(() => {
      if (!this.callInProgress || this.callRequestRetried || !this.callPartner) {
        return;
      }
      this.callRequestRetried = true;
      window.sendSignal({
        type: 'CALL_REQUEST',
        toUsername: this.callPartner,
        videoEnabled: this.isVideoCall,
      });
    }, 6000);
  }

  async acceptCall() {
    if (this.callInProgress) {
      this.notification.classList.remove('open');
      return;
    }

    this.stopIncomingRingtone();
    this.incomingRingLocked = true;

    this.callInProgress = true;
    this.notification.classList.remove('open');
    this.overlay.classList.add('open');
    this.updateAndroidVideoCallState(this.isVideoCall);
    this.partnerLabel.textContent = this.callPartnerDisplayName || this.callPartner || 'Call';
    this.callStateLabel.textContent = 'Preparing media...';
    this.applyCallModeClass();
    this.applyAudioAvatar();

    try {
      await this.setupMedia(this.isVideoCall);
    } catch (error) {
      this.flash(this.isVideoCall ? 'Allow microphone and camera to accept video call' : 'Allow microphone to accept audio call');
      window.sendSignal({
        type: 'CALL_REJECTED',
        toUsername: this.callPartner,
      });
      this.cleanup();
      return;
    }

    const sent = window.sendSignal({
      type: 'CALL_ACCEPTED',
      toUsername: this.callPartner,
    });
    if (!sent) {
      this.cleanup();
      return;
    }
    this.callStateLabel.textContent = 'Connecting...';
  }

  rejectCall() {
    this.notification.classList.remove('open');
    this.stopIncomingRingtone();
    this.incomingRingLocked = true;
    window.sendSignal({
      type: 'CALL_REJECTED',
      toUsername: this.callPartner,
    });
    this.callPartner = null;
  }

  endCall() {
    if (this.callPartner) {
      window.sendSignal({
        type: 'CALL_ENDED',
        toUsername: this.callPartner,
      });
    }
    this.cleanup();
  }

  toggleMute() {
    if (!this.localStream) {
      return;
    }
    this.isMuted = !this.isMuted;
    this.localStream.getAudioTracks().forEach((track) => {
      track.enabled = !this.isMuted;
    });
    this.setControlLabel('btn-toggle-mute', this.isMuted ? 'mic_off' : 'mic', this.isMuted ? 'Unmute' : 'Mute');
  }

  handleThirdControl() {
    if (this.isVideoCall) {
      this.toggleCamera();
      return;
    }
    this.toggleSpeaker();
  }

  toggleCamera() {
    if (!this.localStream) {
      return;
    }
    this.isCameraOff = !this.isCameraOff;
    this.localStream.getVideoTracks().forEach((track) => {
      track.enabled = !this.isCameraOff;
    });
    this.updateCallControlsForMode();
  }

  toggleSpeaker() {
    this.isSpeakerOn = !this.isSpeakerOn;
    this.updateCallControlsForMode();
    this.applySpeakerMode();
  }

  handleSignal(signal) {
    const type = String(signal?.type || '');
    if (type !== 'CALL_REQUEST') {
      this.stopIncomingRingtone();
    }

    switch (signal.type) {
      case 'CALL_REQUEST':
        this.onCallRequest(signal);
        break;
      case 'CALL_GROUP_INVITE':
        this.onGroupInvite(signal);
        break;
      case 'CALL_ACCEPTED':
        this.incomingRingLocked = true;
        if (this.callRequestRetryTimer) {
          clearTimeout(this.callRequestRetryTimer);
          this.callRequestRetryTimer = null;
        }
        if (this.requestTimeoutId) {
          clearTimeout(this.requestTimeoutId);
          this.requestTimeoutId = null;
        }
        this.onCallAccepted();
        break;
      case 'CALL_REJECTED':
        this.incomingRingLocked = true;
        if (this.callRequestRetryTimer) {
          clearTimeout(this.callRequestRetryTimer);
          this.callRequestRetryTimer = null;
        }
        this.flash(`${signal.fromUsername || 'User'} declined your call`);
        this.cleanup();
        break;
      case 'OFFER':
        this.onOffer(signal);
        break;
      case 'ANSWER':
        this.onAnswer(signal);
        break;
      case 'ICE_CANDIDATE':
        this.onIceCandidate(signal);
        break;
      case 'CALL_ENDED':
        this.incomingRingLocked = true;
        if (this.callRequestRetryTimer) {
          clearTimeout(this.callRequestRetryTimer);
          this.callRequestRetryTimer = null;
        }
        this.flash('Call ended');
        this.cleanup();
        break;
      default:
        break;
    }
  }

  inviteParticipant() {
    if (!this.callInProgress) {
      this.flash('Start a call first');
      return;
    }
    const username = (window.prompt('Add participant by username', '') || '').trim();
    if (!username) {
      return;
    }

    const sent = window.sendSignal({
      type: 'CALL_GROUP_INVITE',
      toUsername: username,
      videoEnabled: this.isVideoCall,
      data: JSON.stringify({
        inviter: this.callPartner || '',
        activeCallType: this.isVideoCall ? 'video' : 'audio',
      }),
    });

    if (!sent) {
      return;
    }
    this.flash(`Invite sent to ${username}`);
  }

  onGroupInvite(signal) {
    if (this.callInProgress) {
      window.sendSignal({
        type: 'CALL_REJECTED',
        toUsername: signal.fromUsername,
      });
      return;
    }
    this.onCallRequest({
      ...signal,
      type: 'CALL_REQUEST',
    });
    this.notifType.textContent = this.isVideoCall
      ? 'Invited to join group video call'
      : 'Invited to join group audio call';
  }

  onCallRequest(signal) {
    if (this.incomingRingLocked) {
      return;
    }

    const from = String(signal.fromUsername || '').toLowerCase();
    const now = Date.now();
    if (
      !this.callInProgress
      && this.notification.classList.contains('open')
      && from
      && from === this.lastIncomingCallFrom
      && (now - this.lastIncomingCallAt) < 15000
    ) {
      return;
    }

    if (this.callInProgress) {
      window.sendSignal({
        type: 'CALL_REJECTED',
        toUsername: signal.fromUsername,
      });
      return;
    }

    this.callPartner = signal.fromUsername;
    this.callPartnerDisplayName = signal.fromUsername;
    this.callPartnerAvatarUrl = '';
    this.isVideoCall = !!signal.videoEnabled;
    this.lastIncomingCallFrom = from;
    this.lastIncomingCallAt = now;
    this.applyCallModeClass();
    this.applyAudioAvatar();
    this.notifName.textContent = this.callPartner || 'Unknown';
    this.notifType.textContent = this.isVideoCall ? 'Incoming video call' : 'Incoming audio call';
    this.notification.classList.add('open');
    this.startIncomingRingtone();
  }

  async onCallAccepted() {
    try {
      if (!this.localStream) {
        await this.setupMedia(this.isVideoCall);
      }
      this.createPeerConnection();
      this.localStream.getTracks().forEach((track) => {
        this.peerConnection.addTrack(track, this.localStream);
      });
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);
      const sent = window.sendSignal({
        type: 'OFFER',
        toUsername: this.callPartner,
        data: JSON.stringify({ type: offer.type, sdp: offer.sdp }),
        videoEnabled: this.isVideoCall,
      });
      if (!sent) {
        this.cleanup();
        return;
      }
      this.callStateLabel.textContent = 'Ringing...';
      this.applyCallModeClass();
      this.startTimer();
    } catch (error) {
      this.flash('Failed to start call');
      this.cleanup();
    }
  }

  async onOffer(signal) {
    try {
      if (!this.localStream) {
        await this.setupMedia(!!signal.videoEnabled || this.isVideoCall);
      }
      this.createPeerConnection();
      this.localStream.getTracks().forEach((track) => {
        this.peerConnection.addTrack(track, this.localStream);
      });
      const offer = JSON.parse(signal.data);
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      await this.flushPendingCandidates();
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);
      const sent = window.sendSignal({
        type: 'ANSWER',
        toUsername: signal.fromUsername,
        data: JSON.stringify({ type: answer.type, sdp: answer.sdp }),
      });
      if (!sent) {
        this.cleanup();
        return;
      }
      this.callStateLabel.textContent = 'Connected';
      this.applyCallModeClass();
      this.startTimer();
    } catch (error) {
      this.flash('Failed to accept call');
      this.cleanup();
    }
  }

  async onAnswer(signal) {
    try {
      const answer = JSON.parse(signal.data);
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
      await this.flushPendingCandidates();
      this.callStateLabel.textContent = 'Connected';
      this.applyCallModeClass();
    } catch (error) {
      this.flash('Failed to complete call handshake');
    }
  }

  async onIceCandidate(signal) {
    if (!this.peerConnection || !signal.data) {
      return;
    }
    try {
      const candidate = new RTCIceCandidate(JSON.parse(signal.data));
      if (this.peerConnection.remoteDescription) {
        await this.peerConnection.addIceCandidate(candidate);
      } else {
        this.pendingIceCandidates.push(candidate);
      }
    } catch (error) {
      this.flash('Network candidate rejected');
    }
  }

  async setupMedia(video) {
    const constraints = {
      audio: true,
      video: video
        ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: this.currentFacingMode }
        : false,
    };

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      this.isVideoCall = false;
    }

    this.localVideo.srcObject = this.localStream;
    this.notifyAndroidCallAudioStart();
    const videoTrack = this.localStream.getVideoTracks()[0];
    if (videoTrack && this.isMobileDevice()) {
      const detectedFacing = videoTrack.getSettings?.().facingMode;
      if (detectedFacing === 'user' || detectedFacing === 'environment') {
        this.currentFacingMode = detectedFacing;
      }
    }
    this.updateLocalPreviewTransform();
  }

  async switchCamera() {
    if (!this.localStream || !this.isVideoCall) {
      this.flash('Video call required to switch camera');
      return;
    }

    const nextFacingMode = this.currentFacingMode === 'user' ? 'environment' : 'user';
    try {
      const switched = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { facingMode: { ideal: nextFacingMode } },
      });

      const newVideoTrack = switched.getVideoTracks()[0];
      const newAudioTrack = switched.getAudioTracks()[0];
      if (!newVideoTrack || !newAudioTrack) {
        throw new Error('Missing media tracks');
      }

      const oldTracks = this.localStream.getTracks();
      this.localStream = switched;
      this.localVideo.srcObject = this.localStream;
      const detectedFacing = newVideoTrack.getSettings?.().facingMode;
      this.currentFacingMode = (detectedFacing === 'user' || detectedFacing === 'environment')
        ? detectedFacing
        : nextFacingMode;
      this.updateLocalPreviewTransform();

      if (this.peerConnection) {
        const senders = this.peerConnection.getSenders();
        const videoSender = senders.find((sender) => sender.track && sender.track.kind === 'video');
        const audioSender = senders.find((sender) => sender.track && sender.track.kind === 'audio');
        if (videoSender) {
          await videoSender.replaceTrack(newVideoTrack);
        }
        if (audioSender) {
          await audioSender.replaceTrack(newAudioTrack);
        }
      }

      oldTracks.forEach((track) => track.stop());
    } catch (error) {
      this.flash('Could not switch camera');
    }
  }

  createPeerConnection() {
    this.peerConnection = new RTCPeerConnection(this.iceConfig);

    this.peerConnection.onicecandidate = (event) => {
      if (!event.candidate) {
        return;
      }
      window.sendSignal({
        type: 'ICE_CANDIDATE',
        toUsername: this.callPartner,
        data: JSON.stringify(event.candidate.toJSON()),
      });
    };

    this.peerConnection.ontrack = (event) => {
      if (!this.remoteStream) {
        this.remoteStream = new MediaStream();
      }
      this.remoteStream.addTrack(event.track);

      if (this.isVideoCall) {
        this.remoteAudio.srcObject = null;
        this.remoteVideo.srcObject = this.remoteStream;
        this.remoteVideo.muted = false;
        this.remoteVideo.play().catch(() => {});
      } else {
        this.remoteVideo.srcObject = null;
        this.remoteVideo.muted = true;
        this.remoteAudio.srcObject = this.remoteStream;
        this.refreshAudioOutputOptions();
        this.applySpeakerMode();
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection?.connectionState;
      if (state === 'connecting') {
        this.callStateLabel.textContent = 'Connecting...';
      }
      if (state === 'connected') {
        this.callStateLabel.textContent = 'Connected';
      }
      if (state === 'failed' || state === 'disconnected' || state === 'closed') {
        this.flash('Call connection ended');
        this.cleanup();
      }
    };
  }

  async flushPendingCandidates() {
    if (!this.pendingIceCandidates.length || !this.peerConnection) {
      return;
    }

    const queue = [...this.pendingIceCandidates];
    this.pendingIceCandidates = [];
    for (const candidate of queue) {
      try {
        await this.peerConnection.addIceCandidate(candidate);
      } catch (error) {
      }
    }
  }

  startTimer() {
    this.callStartedAt = Date.now();
    this.timerId = setInterval(() => {
      const elapsed = Math.floor((Date.now() - this.callStartedAt) / 1000);
      const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
      const secs = String(elapsed % 60).padStart(2, '0');
      this.timerLabel.textContent = `${mins}:${secs}`;
    }, 1000);
  }

  cleanup() {
    this.stopIncomingRingtone();
    if (this.requestTimeoutId) {
      clearTimeout(this.requestTimeoutId);
      this.requestTimeoutId = null;
    }
    if (this.callRequestRetryTimer) {
      clearTimeout(this.callRequestRetryTimer);
      this.callRequestRetryTimer = null;
    }
    this.callRequestRetried = false;
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    this.remoteStream = null;
    this.pendingIceCandidates = [];
    this.localVideo.srcObject = null;
    this.remoteVideo.srcObject = null;
    this.remoteVideo.muted = false;
    this.remoteAudio.pause();
    this.remoteAudio.srcObject = null;
    this.notification.classList.remove('open');
    this.overlay.classList.remove('open');
    this.callStateLabel.textContent = 'Waiting';
    this.timerLabel.textContent = '00:00';
    this.callInProgress = false;
    this.isMuted = false;
    this.isCameraOff = false;
    this.isSpeakerOn = false;
    this.currentFacingMode = 'user';
    this.selectedAudioOutputId = '';
    this.lastIncomingCallFrom = '';
    this.lastIncomingCallAt = 0;
    this.incomingRingLocked = false;
    if (this.audioOutputWrap) {
      this.audioOutputWrap.hidden = true;
    }
    this.localVideo.classList.remove('expanded');
    this.updateAndroidVideoCallState(false);
    this.notifyAndroidCallAudioEnd();
    this.applyCallModeClass();
    this.setControlLabel('btn-toggle-mute', 'mic', 'Mute');
    this.updateCallControlsForMode();
  }

  flash(message) {
    const toast = document.getElementById('toast');
    if (!toast) {
      return;
    }
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2200);
  }
}

window.webRTC = new WebRTCManager();
