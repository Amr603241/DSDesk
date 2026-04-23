/**
 * DSDesk PRO MAX - AI Diagnostics Engine
 * Real-time technical issue analysis and automated fixes
 */

class AIDiagnostics {
    constructor() {
        this.issues = [];
        this.fixes = [];
        this.sessionData = [];
        this.listeners = [];
    }

    // Analyze current session for issues
    async analyzeSession(stats) {
        const issues = [];
        
        // Check latency
        if (stats.latency > 200) {
            issues.push({
                type: 'network',
                severity: stats.latency > 500 ? 'critical' : 'warning',
                title: 'Latencia عالية',
                description: `زمن الاستجابة: ${stats.latency}ms`,
                suggestion: 'جرب وضع الضغط العالي أو تقليل FPS'
            });
        }

        // Check FPS
        if (stats.fps < 20) {
            issues.push({
                type: 'performance',
                severity: 'critical',
                title: 'معدل إطارات منخفض',
                description: `FPS: ${stats.fps}`,
                suggestion: 'خفض جودة الصورة أو أغِل تطبيقات أخرى'
            });
        }

        // Check bitrate
        if (stats.bitrate < 1000000) {
            issues.push({
                type: 'bandwidth',
                severity: 'warning',
                title: 'عرض نطاق منخفض',
                description: `Bitrate: ${Math.round(stats.bitrate/1000)}kbps`,
                suggestion: 'تفعيل وضع الضغط العالي'
            });
        }

        return issues;
    }

    // Get automated fix for an issue
    getAutomatedFix(issue) {
        const fixDatabase = {
            'network': [
                { action: 'setQuality', params: { preset: 'fast' }, label: 'تغيير إلىوضع سريع' },
                { action: 'setFPS', params: { fps: 30 }, label: 'تخفيض FPS إلى 30' }
            ],
            'performance': [
                { action: 'setQuality', params: { preset: 'balanced' }, label: 'تغيير إلىوضع متوازن' },
                { action: 'disableCursor', params: {}, label: 'تعطيل مؤشر الماوس' }
            ],
            'bandwidth': [
                { action: 'setCompression', params: { level: 'high' }, label: 'تفعيل الضغط العالي' },
                { action: 'setBitrate', params: { value: 5000000 }, label: 'تخفيض جودةالبث' }
            ]
        };

        return fixDatabase[issue.type] || [];
    }

    // Apply fix with user permission
    async applyFix(fix, executor) {
        return new Promise(async (resolve, reject) => {
            try {
                switch (fix.action) {
                    case 'setQuality':
                        executor.setQualityPreset(fix.params.preset);
                        break;
                    case 'setFPS':
                        executor.setFPS(fix.params.fps);
                        break;
                    case 'setBitrate':
                        executor.setBitrate(fix.params.value);
                        break;
                    case 'setCompression':
                        executor.setCompressionLevel(fix.params.level);
                        break;
                    case 'disableCursor':
                        executor.setRemoteCursor(false);
                        break;
                }
                resolve({ success: true, message: `تم تطبيق: ${fix.label}` });
            } catch (e) {
                reject(e);
            }
        });
    }

    // Monitor and auto-fix
    startAutoMonitoring(stats, executor, interval = 5000) {
        this.monitorInterval = setInterval(async () => {
            const issues = await this.analyzeSession(stats);
            if (issues.length > 0) {
                this.notifyListeners({ type: 'issues', data: issues });
                
                // Auto-fix critical issues
                for (const issue of issues) {
                    if (issue.severity === 'critical') {
                        const fixes = this.getAutomatedFix(issue);
                        if (fixes.length > 0) {
                            this.applyFix(fixes[0], executor);
                        }
                    }
                }
            }
        }, interval);
    }

    stopAutoMonitoring() {
        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
        }
    }

    onDiagnose(callback) {
        this.listeners.push(callback);
    }

    notifyListeners(event) {
        this.listeners.forEach(cb => cb(event));
    }
}

// Behavior-Based Security AI
class BehaviorSecurityAI {
    constructor() {
        this.behaviorPatterns = [];
        this.suspiciousThreshold = 0.8;
        this.sessionMetrics = {
            mouseMovements: [],
            keystrokes: [],
            fileAccesses: [],
            timeOnSystem: 0
        };
    }

    // Analyze user behavior during session
    analyzeBehavior(metrics) {
        const score = this.calculateRiskScore(metrics);
        const alerts = [];

        // Check for automated movement (bot-like)
        if (metrics.mouseMovements.length > 0) {
            const avgSpeed = metrics.mouseMovements.reduce((a, b) => a + b, 0) / metrics.mouseMovements.length;
            if (avgSpeed > 500) {
                alerts.push({
                    type: 'suspicious_activity',
                    severity: 'high',
                    message: 'تحرك سريع غير طبيعي'
                });
            }
        }

        // Check for unusual file access
        if (metrics.fileAccesses > 100) {
            alerts.push({
                type: 'file_access',
                severity: 'medium',
                message: 'وصول了大量 للملفات'
            });
        }

        return {
            riskScore: score,
            alerts: alerts,
            shouldTerminate: score > this.suspiciousThreshold
        };
    }

    calculateRiskScore(metrics) {
        let score = 0;
        
        // Rapid mouse movements
        const mouseVariance = this.calculateVariance(metrics.mouseMovements);
        if (mouseVariance > 1000) score += 0.3;

        // Rapid keystrokes (potential automation)
        if (metrics.keystrokesPerSecond > 10) score += 0.2;

        return Math.min(score, 1);
    }

    calculateVariance(arr) {
        if (arr.length === 0) return 0;
        const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
        return arr.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / arr.length;
    }

    // Alert when suspicious activity detected
    onSecurityAlert(callback) {
        this.alertCallback = callback;
    }

    triggerAlert(alert) {
        if (this.alertCallback) {
            this.alertCallback(alert);
        }
    }
}

// Session Recording with AI Summaries
class SessionRecorder {
    constructor() {
        this.recordings = [];
        this.currentSession = null;
    }

    startRecording(sessionId) {
        this.currentSession = {
            id: sessionId,
            startTime: Date.now(),
            events: [],
            actions: [],
            chat: []
        };
    }

    recordEvent(type, data) {
        if (this.currentSession) {
            this.currentSession.events.push({
                type,
                data,
                timestamp: Date.now()
            });
        }
    }

    recordAction(action) {
        if (this.currentSession) {
            this.currentSession.actions.push({
                action,
                timestamp: Date.now()
            });
        }
    }

    stopRecording() {
        if (this.currentSession) {
            this.currentSession.endTime = Date.now();
            this.currentSession.duration = this.currentSession.endTime - this.currentSession.startTime;
            
            // Generate AI summary
            this.currentSession.summary = this.generateAISummary(this.currentSession);
            
            this.recordings.push(this.currentSession);
            this.currentSession = null;
        }
    }

    generateAISummary(session) {
        const actions = session.actions;
        const summary = {
            duration: this.formatDuration(session.duration),
            totalActions: actions.length,
            keyActions: [],
            decisions: []
        };

        // Extract key actions
        if (actions.length > 0) {
            summary.keyActions = actions.slice(-5).map(a => a.action);
        }

        // Find decisions (settings changes, etc.)
        const decisions = actions.filter(a => 
            a.action.includes('setting') || 
            a.action.includes('config') ||
            a.action.includes('change')
        );
        summary.decisions = decisions.map(d => d.action);

        return summary;
    }

    formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        
        if (hours > 0) return `${hours}h ${minutes % 60}m`;
        if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
        return `${seconds}s`;
    }

    getRecordings() {
        return this.recordings;
    }
}

// Ultra Compression Mode
class UltraCompression {
    constructor() {
        this.compressionLevel = 'balanced'; // balanced, fast, high
    }

    setLevel(level) {
        this.compressionLevel = level;
    }

    getSettings() {
        switch (this.compressionLevel) {
            case 'ultra':
                return {
                    videoBitrate: 1000000,
                    maxBitrate: 2000000,
                    fps: 30,
                    resolutionScale: 0.5,
                    jpegQuality: 60
                };
            case 'high':
                return {
                    videoBitrate: 2000000,
                    maxBitrate: 4000000,
                    fps: 30,
                    resolutionScale: 0.75,
                    jpegQuality: 75
                };
            case 'fast':
                return {
                    videoBitrate: 1000000,
                    maxBitrate: 3000000,
                    fps: 60,
                    resolutionScale: 1,
                    jpegQuality: 85
                };
            default:
                return {
                    videoBitrate: 3000000,
                    maxBitrate: 8000000,
                    fps: 60,
                    resolutionScale: 1,
                    jpegQuality: 90
                };
        }
    }
}

// Export modules
window.AIDiagnostics = AIDiagnostics;
window.BehaviorSecurityAI = BehaviorSecurityAI;
window.SessionRecorder = SessionRecorder;
window.UltraCompression = UltraCompression;