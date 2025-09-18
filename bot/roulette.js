// GLaMS Roulette Wheel Page
import { ConnectionManager, ROOM_NAME, COLORS, wrapPi } from './glams-roulette-common.js';

// =======================
// ROULETTE WHEEL CLASS
// =======================
class RouletteWheel {
	constructor(canvasId, options = {}) {
		this.canvas = document.getElementById(canvasId);
		this.ctx = this.canvas.getContext('2d');
		this.segments = [];
		this.currentIndex = -1;
		this.currentAngle = 0;
		this.spinning = false;
		this.radius = 0;
		this.logicalSize = 1000;

		// Configuration
		this.config = {
			spinMinTurns: options.spinMinTurns || 6,
			spinMaxTurns: options.spinMaxTurns || 9,
			spinDuration: options.spinDuration || 4800,
			labelRotateExtra: options.labelRotateExtra || Math.PI / 2,
			spinEasing: options.spinEasing || (t => 1 - Math.exp(-7 * t))
		};

		// Callbacks
		this.onSpinComplete = options.onSpinComplete || (() => { });
		this.onSegmentsUpdated = options.onSegmentsUpdated || (() => { });

		this.setupCanvas();
		window.addEventListener('resize', () => this.setupCanvas());
	}

	setupCanvas() {
		const dpr = Math.max(1, window.devicePixelRatio || 1);
		const rect = this.canvas.getBoundingClientRect();
		this.canvas.width = Math.round(rect.width * dpr);
		this.canvas.height = Math.round(rect.height * dpr);
		this.ctx.setTransform(1, 0, 0, 1, 0, 0);
		this.ctx.scale(dpr, dpr);

		this.logicalSize = Math.min(rect.width, rect.height);
		this.radius = this.logicalSize * 0.45;
		this.drawWheel();
	}

	loadSegments(segmentsData) {
		this.segments = segmentsData || [];
		const hasSegments = this.segments.length > 0;

		if (hasSegments) {
			this.currentIndex = 0;
		} else {
			this.currentIndex = -1;
		}

		this.onSegmentsUpdated(this.segments, hasSegments);
		this.drawWheel();
		return hasSegments;
	}

	drawWheel() {
		const w = this.canvas.getBoundingClientRect().width;
		const h = this.canvas.getBoundingClientRect().height;
		this.ctx.clearRect(0, 0, w, h);

		const cx = w / 2, cy = h / 2;
		this.ctx.save();
		this.ctx.translate(cx, cy);

		// Glow ring
		this.ctx.beginPath();
		this.ctx.arc(0, 0, this.radius + 14, 0, Math.PI * 2);
		const g1 = this.ctx.createRadialGradient(0, 0, this.radius, 0, 0, this.radius + 40);
		g1.addColorStop(0, 'rgba(255,255,255,0)');
		g1.addColorStop(1, 'rgba(255,255,255,0.09)');
		this.ctx.fillStyle = g1;
		this.ctx.fill();

		if (this.segments.length === 0) {
			this.ctx.restore();
			return;
		}

		const slice = (Math.PI * 2) / this.segments.length;

		// Rotate the whole wheel by currentAngle
		this.ctx.rotate(this.currentAngle);

		for (let i = 0; i < this.segments.length; i++) {
			const start = i * slice - Math.PI / 2;
			const end = start + slice;

			// Fill
			this.ctx.beginPath();
			this.ctx.moveTo(0, 0);
			this.ctx.arc(0, 0, this.radius, start, end);
			this.ctx.closePath();
			this.ctx.fillStyle = COLORS[i % COLORS.length];
			this.ctx.fill();

			// Separator
			this.ctx.strokeStyle = 'rgba(255,255,255,.35)';
			this.ctx.lineWidth = 2;
			this.ctx.beginPath();
			this.ctx.moveTo(0, 0);
			this.ctx.lineTo(Math.cos(start) * this.radius, Math.sin(start) * this.radius);
			this.ctx.stroke();

			// Text
			const label = (this.segments[i].displayName ?? '').toString();
			if (label) {
				const mid = start + slice / 2;
				this.ctx.save();
				const textRadius = this.radius * 0.95; // Very close to edge
				this.ctx.translate(Math.cos(mid) * textRadius, Math.sin(mid) * textRadius);

				// Keep text tangent to the circle but left-aligned
				this.ctx.rotate(mid + Math.PI / 2 + this.config.labelRotateExtra);

				this.ctx.textAlign = 'start'; // 'start' respects text direction
				this.ctx.textBaseline = 'middle';
				this.ctx.font = `400 ${Math.max(12, Math.min(20, this.radius * 0.06))}px Inter, ui-sans-serif`;
				this.ctx.lineWidth = 4;
				this.ctx.strokeStyle = 'rgba(0,0,0,.8)';
				this.ctx.strokeText(label, 0, 0);
				this.ctx.fillStyle = '#fff';
				this.ctx.fillText(label, 0, 0);
				this.ctx.restore();
			}

		}

		// Rim
		this.ctx.beginPath();
		this.ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
		this.ctx.lineWidth = 10;
		this.ctx.strokeStyle = 'rgba(255,255,255,.85)';
		this.ctx.stroke();

		this.ctx.restore();
	}

	flashRing() {
		const w = this.canvas.getBoundingClientRect().width;
		const h = this.canvas.getBoundingClientRect().height;
		const cx = w / 2, cy = h / 2;
		const maxR = this.radius + 18;
		let alpha = 0.6;

		const step = () => {
			alpha -= 0.04;
			if (alpha <= 0) {
				this.drawWheel();
				return;
			}
			this.drawWheel();
			this.ctx.save();
			this.ctx.translate(cx, cy);
			this.ctx.beginPath();
			this.ctx.arc(0, 0, maxR, 0, Math.PI * 2);
			this.ctx.lineWidth = 10;
			this.ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
			this.ctx.stroke();
			this.ctx.restore();
			requestAnimationFrame(step);
		};
		step();
	}

	spin() {
		if (this.spinning || this.segments.length === 0) return false;

		this.spinning = true;

		// Preselect winner
		const winnerIndex = Math.floor(Math.random() * this.segments.length);
		const TWO_PI = Math.PI * 2;
		const slice = TWO_PI / this.segments.length;

		// Winner center in wheel coordinates
		const winnerCenterAngle = winnerIndex * slice + slice / 2;

		// Base: land with winner at top (-π/2)
		const extraTurns = this.config.spinMinTurns + Math.random() * (this.config.spinMaxTurns - this.config.spinMinTurns);
		let target = this.currentAngle + (-Math.PI / 2 - winnerCenterAngle) + TWO_PI * extraTurns;

		// Small visual jitter, then exact correction
		const jitter = (Math.random() - 0.5) * (slice * 0.12);
		target += jitter;

		// Exact correction for perfect alignment
		const misalign = wrapPi((winnerCenterAngle + target) - (-Math.PI / 2));
		target -= misalign;

		const start = this.currentAngle;
		const delta = target - start;
		const t0 = performance.now();

		const animate = (now) => {
			const t = Math.min(1, (now - t0) / this.config.spinDuration);
			const eased = this.config.spinEasing(t);
			this.currentAngle = start + delta * eased;
			this.drawWheel();

			if (t < 1) {
				requestAnimationFrame(animate);
			} else {
				// Snap to exact final angle
				this.currentAngle = target;
				this.drawWheel();
				this.currentIndex = winnerIndex;
				this.spinning = false;
				this.flashRing();
				this.onSpinComplete(winnerIndex, this.segments[winnerIndex]);
			}
		};
		requestAnimationFrame(animate);
		return true;
	}

	removeCurrentSegment() {
		if (this.spinning || this.segments.length === 0 || this.currentIndex < 0) return false;

		this.segments.splice(this.currentIndex, 1);

		if (this.segments.length === 0) {
			this.currentIndex = -1;
			this.onSegmentsUpdated(this.segments, false);
			this.drawWheel();
			return true;
		}

		// Recompute which segment is under the pointer
		const TWO_PI = Math.PI * 2;
		const slice = TWO_PI / this.segments.length;
		const pointerAngle = ((-this.currentAngle % TWO_PI) + TWO_PI) % TWO_PI;
		let idx = Math.floor((pointerAngle + slice / 2) / slice) % this.segments.length;

		this.currentIndex = Math.min(idx, this.segments.length - 1);
		this.onSegmentsUpdated(this.segments, true);
		this.drawWheel();
		return true;
	}

	getCurrentSegment() {
		return this.currentIndex >= 0 ? this.segments[this.currentIndex] : null;
	}
}

// =======================
// ROULETTE APP CLASS
// =======================
class RouletteApp {
	constructor() {
		// Initialize components
		this.wheel = new RouletteWheel('wheelCanvas', {
			onSpinComplete: (index, segment) => this.onSpinComplete(index, segment),
			onSegmentsUpdated: (segments, hasSegments) => this.onSegmentsUpdated(segments, hasSegments)
		});

		this.connectionManager = new ConnectionManager({
			onConnect: (info) => this.updateConnectionStatus(true, info),
			onDisconnect: (reason) => this.updateConnectionStatus(false, reason),
			onError: (error) => this.updateConnectionStatus(false, error)
		});

		// Get DOM elements
		this.elements = {
			connDot: document.getElementById('connDot'),
			connText: document.getElementById('connText'),
			segCount: document.getElementById('segCount'),
			currName: document.getElementById('currentName'),
			spinBtn: document.getElementById('spinBtn'),
			execBtn: document.getElementById('executeBtn'),
			stopBtn: document.getElementById('stopBtn'),
			removeBtn: document.getElementById('removeBtn'),
			noSeg: document.getElementById('noSeg'),
			configTextarea: document.getElementById('configTextarea'),
			loadConfigBtn: document.getElementById('loadConfigBtn'),
			configStatus: document.getElementById('configStatus'),
		};

		this.initialize();
	}

	initialize() {
		// Load default config into textarea on first run
		this.loadDefaultConfigToTextarea();

		// Load segments from textarea
		this.loadSegmentsFromTextarea();

		// Connect to GLaMS
		this.connectToGLaMS().catch(() => { });

		// Set up event listeners
		this.elements.spinBtn?.addEventListener('click', () => this.spin());
		this.elements.execBtn?.addEventListener('click', () => this.executeCurrent());
		this.elements.stopBtn?.addEventListener('click', () => this.stopAll());
		this.elements.removeBtn?.addEventListener('click', () => this.removeCurrent());
		this.elements.loadConfigBtn?.addEventListener('click', () => this.loadSegmentsFromTextarea());
	}

	loadDefaultConfigToTextarea() {
		try {
			const configElement = document.getElementById('default-segments-config');
			if (!configElement || !this.elements.configTextarea) return;

			const config = JSON.parse(configElement.textContent || '{}');
			this.elements.configTextarea.value = JSON.stringify(config, null, 2);
		} catch (e) {
			console.error('Failed to load default config', e);
		}
	}

	loadSegmentsFromTextarea() {
		try {
			if (!this.elements.configTextarea) return false;

			const configText = this.elements.configTextarea.value.trim();
			if (!configText) {
				this.updateConfigStatus('No configuration provided', 'error');
				this.wheel.loadSegments([]);
				return false;
			}

			const config = JSON.parse(configText);
			const success = this.wheel.loadSegments(config.segments || []);

			this.updateConfigStatus(
				success ? `Loaded ${config.segments?.length || 0} segments` : 'No segments found in config',
				success ? 'success' : 'error'
			);

			return success;
		} catch (e) {
			this.updateConfigStatus(`Invalid JSON: ${e.message}`, 'error');
			this.wheel.loadSegments([]);
			return false;
		}
	}

	updateConfigStatus(message, type = '') {
		if (!this.elements.configStatus) return;

		this.elements.configStatus.textContent = message;
		this.elements.configStatus.className = `config-status ${type}`;

		// Clear status after 3 seconds for non-error messages
		if (type !== 'error') {
			setTimeout(() => {
				if (this.elements.configStatus) {
					this.elements.configStatus.textContent = 'Ready';
					this.elements.configStatus.className = 'config-status';
				}
			}, 3000);
		}
	}

	onSpinComplete(index, segment) {
		if (this.elements.currName) {
			this.elements.currName.textContent = segment?.displayName ?? '—';
		}

		// Re-enable buttons
		if (this.elements.spinBtn) this.elements.spinBtn.disabled = false;
		if (this.elements.execBtn) this.elements.execBtn.disabled = false;
		if (this.elements.stopBtn) this.elements.stopBtn.disabled = false;
		if (this.elements.removeBtn) this.elements.removeBtn.disabled = false;
	}

	onSegmentsUpdated(segments, hasSegments) {
		// Update segment count
		if (this.elements.segCount) {
			this.elements.segCount.textContent = `${segments.length} segments loaded`;
		}

		// Update button states
		if (this.elements.spinBtn) this.elements.spinBtn.disabled = !hasSegments;
		if (this.elements.execBtn) this.elements.execBtn.disabled = !hasSegments;
		if (this.elements.removeBtn) this.elements.removeBtn.disabled = !hasSegments;

		// Show/hide no segments message
		if (this.elements.noSeg) {
			this.elements.noSeg.style.display = hasSegments ? 'none' : 'block';
		}

		// Update current name
		if (this.elements.currName) {
			const current = this.wheel.getCurrentSegment();
			this.elements.currName.textContent = current?.displayName ?? 'None';
		}
	}

	updateConnectionStatus(connected, info = '') {
		if (this.elements.connDot) {
			this.elements.connDot.classList.toggle('connected', connected);
		}

		if (this.elements.connText) {
			this.elements.connText.textContent = connected ?
				`Connected to ${this.connectionManager.currentRoom || ROOM_NAME}` :
				'Disconnected';
		}
	}

	spin() {
		if (!this.wheel.spin()) return;

		// Disable buttons during spin
		if (this.elements.spinBtn) this.elements.spinBtn.disabled = true;
		if (this.elements.execBtn) this.elements.execBtn.disabled = true;
		if (this.elements.removeBtn) this.elements.removeBtn.disabled = true;
	}

	// Simple timeout wrapper - add this method to your RouletteApp class
	withTimeout(promise, timeoutMs = 10000) {
		return Promise.race([
			promise,
			new Promise((_, reject) =>
				setTimeout(() => reject(new Error('timeout')), timeoutMs)
			)
		]);
	}

	// Replace your existing executeCurrent method
	async executeCurrent() {
		if (!this.connectionManager.isConnected) return;

		const segment = this.wheel.getCurrentSegment();
		if (!segment) return;

		const execBtn = this.elements.execBtn;
		if (!execBtn) return;

		execBtn.disabled = true;
		const oldText = execBtn.textContent;
		execBtn.textContent = 'Executing…';

		try {
			const actions = segment.actions || [];
			for (const action of actions) {
				await this.connectionManager.executeAction(
					action.manipulatorId,
					action.actionName,
					action.parameters || {}
				);
				await new Promise(r => setTimeout(r, 100));
			}
		} catch (e) {
			console.warn('Execute failed:', e.message);
		}
		finally {
			execBtn.textContent = oldText;
			execBtn.disabled = false;
		}
	}

	// Replace your existing stopAll method
	async stopAll() {
		if (!this.connectionManager.isConnected) return;

		const stopBtn = this.elements.stopBtn;
		if (!stopBtn) return;

		stopBtn.disabled = true;
		const oldText = stopBtn.textContent;
		stopBtn.textContent = 'Stopping…';

		try {
			await this.connectionManager.disableAllManipulators().catch(e => console.warn('Disable failed:', e.message));
			await new Promise(r => setTimeout(r, 100));
			await this.connectionManager.resetManipulatorConfigs().catch(e => console.warn('Reset failed:', e.message));
		} catch (e) {
			// Just log it and move on
			console.warn('Stop timed out or failed:', e.message);
		} finally {
			stopBtn.textContent = oldText;
			stopBtn.disabled = false;
		}
	}

	removeCurrent() {
		this.wheel.removeCurrentSegment();
	}

	async connectToGLaMS() {
		try {
			await this.connectionManager.connect(ROOM_NAME, 'browser');
		} catch (e) {
			console.error('Connection failed', e);
		}
	}
}

// =======================
// INITIALIZATION
// =======================

// Initialize when DOM is loaded
function initializeRouletteApp() {
	const rouletteApp = new RouletteApp();
	window.rouletteApp = rouletteApp; // For debugging
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', initializeRouletteApp);
} else {
	initializeRouletteApp();
}