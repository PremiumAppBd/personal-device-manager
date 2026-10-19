package com.pdm.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val DarkColors = darkColorScheme(
    primary = Color(0xFF8AB4FF),
    secondary = Color(0xFF9CC3FF),
    background = Color(0xFF0B1120),
    surface = Color(0xFF111827),
)

private val LightColors = lightColorScheme(
    primary = Color(0xFF2F58D4),
    secondary = Color(0xFF3B6EF6),
)

@Composable
fun PdmTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        content = content,
    )
}
