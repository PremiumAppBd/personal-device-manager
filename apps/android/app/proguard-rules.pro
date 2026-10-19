# Keep kotlinx.serialization generated serializers.
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.**
-keepclassmembers class **$$serializer { *; }
-keepclasseswithmembers class com.pdm.app.data.net.** {
    kotlinx.serialization.KSerializer serializer(...);
}
# Room
-keep class * extends androidx.room.RoomDatabase { <init>(); }
