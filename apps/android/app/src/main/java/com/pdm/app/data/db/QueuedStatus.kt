package com.pdm.app.data.db

import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.RoomDatabase

/**
 * A status sample queued locally when the network is unavailable or the API
 * call fails. The worker drains this queue when connectivity returns.
 */
@Entity(tableName = "queued_status")
data class QueuedStatusEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val payloadJson: String,
    val createdAt: Long,
)

@Dao
interface QueuedStatusDao {
    @Insert
    suspend fun insert(item: QueuedStatusEntity): Long

    @Query("SELECT * FROM queued_status ORDER BY createdAt ASC LIMIT :limit")
    suspend fun oldest(limit: Int): List<QueuedStatusEntity>

    @Query("DELETE FROM queued_status WHERE id = :id")
    suspend fun delete(id: Long)

    @Query("SELECT COUNT(*) FROM queued_status")
    suspend fun count(): Int

    // Cap the local queue so a long offline period cannot grow unbounded.
    @Query("DELETE FROM queued_status WHERE id NOT IN (SELECT id FROM queued_status ORDER BY createdAt DESC LIMIT :keep)")
    suspend fun trimTo(keep: Int)
}

@Database(entities = [QueuedStatusEntity::class], version = 1, exportSchema = false)
abstract class PdmDatabase : RoomDatabase() {
    abstract fun queuedStatusDao(): QueuedStatusDao
}
