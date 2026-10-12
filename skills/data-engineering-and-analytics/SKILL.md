---
name: data-engineering-and-analytics
description: Build scalable data pipelines, ETL/ELT workflows, DuckDB/Polars processing, Parquet storage, and data validation
tools: [listDir, readFile, writeFile, editFile, runTerminal]
---
# Data Engineering & Analytics Mastery Skill

## Core Philosophy: Data Integrity, High Throughput, Idempotency
Data engineering systems must process massive volumes reliably, guarantee idempotent re-runs, strictly enforce schema contracts, and deliver fast analytical queries through columnar storage and vectorized execution.

---

## 1. Zero-Stub & Pipeline Architecture Mandate
- **NEVER create data transformations without schema validation and null checks.**
- **Full Architecture Requirements**:
  1. **Idempotent Ingestion & Processing**: Every pipeline run must produce identical output if re-executed on the same input partition. Use atomic writes (`.tmp` write followed by atomic rename).
  2. **Modern Columnar Formats**: Default to Apache Parquet with Snappy or ZSTD compression for analytical datasets. Never store analytical cold data in uncompressed JSON or raw CSV.
  3. **Vectorized Engines (DuckDB & Polars)**:
     - Use DuckDB for embedded OLAP SQL queries directly over Parquet/CSV files.
     - Use Polars (Rust/Python) for blazing fast memory-efficient dataframes with lazy execution plans (`lazy().filter(...).collect()`).
  4. **Data Validation & Quality Checks**:
     - Enforce non-null constraints, value ranges, uniqueness, and regex patterns before loading into data marts.
     - Reject and quarantine malformed records with line numbers and failure reasons into an error partition.
  5. **Schema Evolution & Migration**: Handle added columns with default values and backwards-compatible Arrow/Parquet schemas.
  6. **Telemetry & Lineage**: Log record counts (read, transformed, written, dropped), execution duration, memory peak, and output checksums.

---

## 2. Implementation Patterns

### DuckDB In-Memory OLAP (Node.js & Python)
```python
import duckdb

def transform_analytics(raw_parquet_path: str, output_parquet_path: str):
    con = duckdb.connect()
    con.execute(f"""
        COPY (
            SELECT
                date_trunc('day', timestamp) AS event_date,
                category,
                count(*) AS total_events,
                sum(amount) AS total_revenue,
                avg(duration_ms) AS avg_duration
            FROM read_parquet('{raw_parquet_path}')
            WHERE amount >= 0 AND user_id IS NOT NULL
            GROUP BY 1, 2
            ORDER BY 1 DESC, 4 DESC
        ) TO '{output_parquet_path}' (FORMAT PARQUET, COMPRESSION ZSTD);
    """)
    con.close()
```

### Polars LazyFrame Execution (Python)
```python
import polars as pl

def process_large_dataset(input_path: str, output_path: str):
    q = (
        pl.scan_parquet(input_path)
        .filter(pl.col("status") == "SUCCESS")
        .with_columns([
            (pl.col("price") * pl.col("quantity")).alias("total_value"),
            pl.col("timestamp").dt.year().alias("year"),
        ])
        .group_by(["year", "category"])
        .agg([
            pl.col("total_value").sum().alias("annual_revenue"),
            pl.col("customer_id").n_unique().alias("unique_customers"),
        ])
    )
    result = q.collect()
    result.write_parquet(output_path, compression="zstd")
```

---

## 3. Production Verification Checklist
1. Schema Validation: Source schema matches target specification before processing begins.
2. Row Count Verification: Ingested rows equal processed rows plus quarantined rows.
3. Memory Safety: Streaming or partitioned batch processing prevents OOM (Out Of Memory) crashes on large datasets.
