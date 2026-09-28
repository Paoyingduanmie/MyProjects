package com.nancy.devinmobile

import android.content.Context
import android.text.InputType
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import android.widget.TextView
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.google.android.material.bottomsheet.BottomSheetDialog

/**
 * 底部弹层（对齐 web 的 bottom sheet）：选项列表 / 输入行 / 确认。
 * 替代原生 AlertDialog。
 */
object Sheet {

    /** 选项行：label + 可选颜色 + 点击回调。 */
    data class Row(val label: String, val color: Int = 0)

    /** 底部选项列表弹层。 */
    fun list(
        ctx: Context, title: String, rows: List<Row>,
        onPick: (Int) -> Unit,
    ) {
        val dlg = BottomSheetDialog(ctx)
        val v = LayoutInflater.from(ctx).inflate(R.layout.sheet_list, null)
        v.findViewById<TextView>(R.id.sheet_title).apply {
            text = title
            visibility = if (title.isEmpty()) View.GONE else View.VISIBLE
        }
        val rv = v.findViewById<RecyclerView>(R.id.sheet_rows)
        rv.layoutManager = LinearLayoutManager(ctx)
        rv.adapter = object : RecyclerView.Adapter<RecyclerView.ViewHolder>() {
            override fun getItemCount() = rows.size
            override fun onCreateViewHolder(p: ViewGroup, t: Int) = object : RecyclerView.ViewHolder(
                LayoutInflater.from(ctx).inflate(R.layout.sheet_row, p, false)) {}
            override fun onBindViewHolder(h: RecyclerView.ViewHolder, i: Int) {
                val tv = h.itemView as TextView
                tv.text = rows[i].label
                if (rows[i].color != 0) tv.setTextColor(rows[i].color)
                tv.setOnClickListener { onPick(i); dlg.dismiss() }
            }
        }
        dlg.setContentView(v)
        dlg.show()
    }

    /** 底部输入弹层（重命名/标签/ACU/排队消息编辑等）。 */
    fun input(
        ctx: Context, title: String, hint: String = "",
        initial: String = "", password: Boolean = false,
        okLabel: String = "确定",
        onOk: (String) -> Unit,
    ) {
        val dlg = BottomSheetDialog(ctx)
        val v = LayoutInflater.from(ctx).inflate(R.layout.sheet_input, null)
        v.findViewById<TextView>(R.id.sheet_title).text = title
        val et = v.findViewById<EditText>(R.id.sheet_edit)
        et.hint = hint
        et.setText(initial)
        et.setSelectAllOnFocus(true)
        if (password) et.inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
        v.findViewById<TextView>(R.id.sheet_ok).text = okLabel
        v.findViewById<TextView>(R.id.sheet_ok).setOnClickListener {
            onOk(et.text.toString().trim()); dlg.dismiss()
        }
        v.findViewById<TextView>(R.id.sheet_cancel).setOnClickListener { dlg.dismiss() }
        dlg.setContentView(v)
        dlg.setOnShowListener {
            et.requestFocus()
            et.postDelayed({
                (ctx.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager)
                    .showSoftInput(et, InputMethodManager.SHOW_IMPLICIT)
            }, 150)
        }
        dlg.show()
    }

    /** 底部确认弹层（删除/停止等）。 */
    fun confirm(
        ctx: Context, title: String, message: String,
        okLabel: String = "确定", destructive: Boolean = false,
        onOk: () -> Unit,
    ) {
        list(ctx, message.ifEmpty { title }, listOf(
            Row(okLabel, if (destructive) 0xFFD44540.toInt() else 0),
            Row("取消"),
        )) { i -> if (i == 0) onOk() }
    }
}
