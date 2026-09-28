// 音效模块:用 Web Audio API 程序合成短音,无需任何外部音频文件。
(function () {
  'use strict';
  var OS = (window.OS = window.OS || {});
  var ctx = null;
  var enabled = true;
  function pgv(){var v=parseFloat(localStorage.getItem("pg_volume"));return isNaN(v)?1:v/100;}

  function ensure() {
    if (ctx) return ctx;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) ctx = new AC();
    } catch (e) { ctx = null; }
    return ctx;
  }

  // 单音:freq 频率, dur 秒, type 波形, gain 音量, delay 延迟(用于琶音)
  function tone(freq, dur, type, gain, delay) {
    if (!enabled) return;
    var ac = ensure();
    if (!ac) return;
    var t0 = ac.currentTime + (delay || 0);
    var osc = ac.createOscillator();
    var g = ac.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime((gain || 0.2) * pgv(), t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  OS.SFX = {
    setEnabled: function (v) { enabled = !!v; },
    isEnabled: function () { return enabled; },
    // 浏览器策略:AudioContext 需在用户交互后才能发声,首次按下时调用
    resume: function () {
      var ac = ensure();
      if (ac && ac.state === 'suspended') { try { ac.resume(); } catch (e) {} }
    },
    place: function () { tone(520, 0.07, 'triangle', 0.24); },                 // 点亮一格
    undo: function () { tone(300, 0.07, 'triangle', 0.18); },                   // 回退
    error: function () { tone(150, 0.12, 'sawtooth', 0.17); },                  // 方向违规被挡
    win: function () {                                                          // 通关琶音
      [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.18, 'triangle', 0.26, i * 0.09); });
    }
  };
})();
