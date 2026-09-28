package com.nancy.devinmobile

data class Session(
    val id: String,
    val title: String,
    val statusEnum: String,
    val updatedAt: Long,
    val prUrl: String?,
    val prState: String? = null,
    val statusDetail: String = "",
    val isArchived: Boolean = false,
    val unread: Boolean = false,
    val starred: Boolean = false,
    val tags: List<String> = emptyList(),
    val folder: String = "",
    val model: String = "",
    val excerpt: String = "",
) {
    val active: Boolean get() = statusEnum == "working" || statusEnum == "running"
}

data class Message(
    val fromUser: Boolean,
    val text: String,
    val timestamp: Long,
)

class ApiException(val code: Int, message: String) : Exception(message)
