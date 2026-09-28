package com.nancy.playground

import androidx.media3.common.C
import androidx.media3.common.audio.AudioProcessor
import androidx.media3.common.audio.BaseAudioProcessor
import java.nio.ByteBuffer
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.math.tanh

/**
 * 软件音效处理器：直接处理 PCM16（单/双声道），不依赖系统 audiofx，任何机型可用。
 * 链：低架(150Hz) → 峰形(1kHz) → 高架(8kHz) → 声场加宽 → 响度增益(软削波)。
 */
class FxAudioProcessor : BaseAudioProcessor() {

    /** 与 index.html 均衡器预设下标一致 */
    val presetNames = arrayOf(
        "Normal", "Flat", "Classical", "Dance", "Folk",
        "Heavy Metal", "Hip Hop", "Jazz", "Pop", "Rock"
    )

    // 每个预设的低/中/高三段增益（dB）
    private val presetCurve = arrayOf(
        floatArrayOf(0f, 0f, 0f),      // Normal 默认
        floatArrayOf(0f, 0f, 0f),      // Flat 平直
        floatArrayOf(3f, -1f, 3f),     // Classical 古典
        floatArrayOf(5f, 0f, 3f),      // Dance 舞曲
        floatArrayOf(1f, 3f, 1f),      // Folk 民谣
        floatArrayOf(5f, -2f, 6f),     // Heavy Metal 重金属
        floatArrayOf(6f, 0f, 2f),      // Hip Hop 嘻哈
        floatArrayOf(3f, -1f, 4f),     // Jazz 爵士
        floatArrayOf(2f, 4f, 1f),      // Pop 流行
        floatArrayOf(4f, -1f, 5f),     // Rock 摇滚
    )

    data class FxCfg(val preset: Int, val bassDb: Float, val widen: Boolean, val loud: Boolean)

    @Volatile private var cfg = FxCfg(0, 0f, false, false)

    fun configure(preset: Int, bassDb: Float, widen: Boolean, loud: Boolean) {
        cfg = FxCfg(preset.coerceIn(0, presetNames.size - 1), bassDb, widen, loud)
    }

    /** RBJ cookbook 双二阶滤波器 */
    private class Biquad {
        private var b0 = 1.0; private var b1 = 0.0; private var b2 = 0.0
        private var a1 = 0.0; private var a2 = 0.0
        private var x1 = 0.0; private var x2 = 0.0; private var y1 = 0.0; private var y2 = 0.0

        fun reset() { x1 = 0.0; x2 = 0.0; y1 = 0.0; y2 = 0.0 }

        fun process(x: Double): Double {
            val y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
            x2 = x1; x1 = x; y2 = y1; y1 = y
            return y
        }

        private fun set(nb0: Double, nb1: Double, nb2: Double, na0: Double, na1: Double, na2: Double) {
            b0 = nb0 / na0; b1 = nb1 / na0; b2 = nb2 / na0; a1 = na1 / na0; a2 = na2 / na0
        }

        fun lowshelf(fc: Double, gainDb: Double, fs: Double) {
            val a = sqrt(10.0.pow(gainDb / 20.0))
            val w0 = 2 * Math.PI * fc / fs
            val cw = cos(w0)
            val sa = sin(w0) / 2 * sqrt(2.0) * 2 * sqrt(a)   // S=1
            set(
                a * ((a + 1) - (a - 1) * cw + sa),
                2 * a * ((a - 1) - (a + 1) * cw),
                a * ((a + 1) - (a - 1) * cw - sa),
                (a + 1) + (a - 1) * cw + sa,
                -2 * ((a - 1) + (a + 1) * cw),
                (a + 1) + (a - 1) * cw - sa
            )
        }

        fun highshelf(fc: Double, gainDb: Double, fs: Double) {
            val a = sqrt(10.0.pow(gainDb / 20.0))
            val w0 = 2 * Math.PI * fc / fs
            val cw = cos(w0)
            val sa = sin(w0) / 2 * sqrt(2.0) * 2 * sqrt(a)
            set(
                a * ((a + 1) + (a - 1) * cw + sa),
                -2 * a * ((a - 1) + (a + 1) * cw),
                a * ((a + 1) + (a - 1) * cw - sa),
                (a + 1) - (a - 1) * cw + sa,
                2 * ((a - 1) - (a + 1) * cw),
                (a + 1) - (a - 1) * cw - sa
            )
        }

        fun peaking(fc: Double, q: Double, gainDb: Double, fs: Double) {
            val a = 10.0.pow(gainDb / 40.0)
            val w0 = 2 * Math.PI * fc / fs
            val cw = cos(w0)
            val alpha = sin(w0) / (2 * q)
            set(1 + alpha * a, -2 * cw, 1 - alpha * a, 1 + alpha / a, -2 * cw, 1 - alpha / a)
        }
    }

    private var lows: Array<Biquad> = emptyArray()
    private var mids: Array<Biquad> = emptyArray()
    private var highs: Array<Biquad> = emptyArray()
    private var sampleRate = 44100
    private var channels = 2
    private var applied: FxCfg? = null

    override fun onConfigure(inputAudioFormat: AudioProcessor.AudioFormat): AudioProcessor.AudioFormat {
        if (inputAudioFormat.encoding != C.ENCODING_PCM_16BIT) {
            throw AudioProcessor.UnhandledAudioFormatException(inputAudioFormat)
        }
        sampleRate = inputAudioFormat.sampleRate
        channels = inputAudioFormat.channelCount
        lows = Array(channels) { Biquad() }
        mids = Array(channels) { Biquad() }
        highs = Array(channels) { Biquad() }
        applied = null
        return inputAudioFormat
    }

    private fun ensureCoeffs() {
        val c = cfg
        if (c == applied || lows.isEmpty()) return
        applied = c
        val curve = presetCurve[c.preset]
        val lowDb = (curve[0] + c.bassDb).toDouble()
        val midDb = curve[1].toDouble()
        val highDb = curve[2].toDouble()
        val fs = sampleRate.toDouble()
        for (ch in lows.indices) {
            lows[ch].lowshelf(150.0, lowDb, fs)
            mids[ch].peaking(1000.0, 0.9, midDb, fs)
            highs[ch].highshelf(min(8000.0, fs * 0.4), highDb, fs)
        }
    }

    private fun toPcm(v: Double): Short =
        (v * 32767.0).toInt().coerceIn(-32768, 32767).toShort()

    override fun queueInput(inputBuffer: ByteBuffer) {
        ensureCoeffs()
        var remaining = inputBuffer.remaining()
        if (remaining <= 0 || lows.isEmpty()) return
        val c = cfg
        val gain = if (c.loud) 1.5 else 1.0
        val out = replaceOutputBuffer(remaining)
        while (remaining >= channels * 2) {
            if (channels == 2) {
                var l = inputBuffer.short.toInt() / 32768.0
                var r = inputBuffer.short.toInt() / 32768.0
                l = highs[0].process(mids[0].process(lows[0].process(l)))
                r = highs[1].process(mids[1].process(lows[1].process(r)))
                if (c.widen) {
                    val nl = l + 0.25 * (l - r); val nr = r + 0.25 * (r - l)
                    l = nl; r = nr
                }
                l *= gain; r *= gain
                out.putShort(toPcm(if (c.loud) tanh(l) else l))
                out.putShort(toPcm(if (c.loud) tanh(r) else r))
            } else {
                for (ch in 0 until channels) {
                    var s = inputBuffer.short.toInt() / 32768.0
                    s = highs[ch].process(mids[ch].process(lows[ch].process(s)))
                    s *= gain
                    out.putShort(toPcm(if (c.loud) tanh(s) else s))
                }
            }
            remaining -= channels * 2
        }
        out.flip()
    }

    override fun onFlush() {
        lows.forEach { it.reset() }; mids.forEach { it.reset() }; highs.forEach { it.reset() }
    }
}
