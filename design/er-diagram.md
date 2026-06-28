# Entity-Relationship Diagram - 4E Flora, Fauna & Estate Biodiversity Tracker

Group ER diagram covering the full system. The Member 3 entities (authentication
and resident reports) are complete below; teammate entities (M1 Flora, M2 Fauna,
M4 Alerts) are placeholders to be added later.

```mermaid
erDiagram
    User ||--o{ ResidentReport : "files (reported_by)"
    ResidentReport ||--o{ CaseStatusLog : "has history"
    User ||--o{ CaseStatusLog : "makes changes (changed_by)"

    User {
        int id PK
        string name
        string email UK
        string password_hash
        enum role "resident, staff, admin"
    }

    ResidentReport {
        int id PK
        enum category "flora_health, community_cat, pigeon, pest, other"
        string title
        text description
        json photo_urls "array of URL strings"
        float gps_lat "nullable"
        float gps_lng "nullable"
        string block_number "nullable"
        string floor_level "nullable"
        enum status "open, in_progress, resolved"
        int reported_by FK
        boolean is_deleted "soft delete"
    }

    CaseStatusLog {
        int id PK
        int report_id FK
        string old_status
        string new_status
        int changed_by FK
    }

    %% ----------------------------------------------------------------
    %% Teammate entities - add below, plus their relationships above.
    %% M1 Flora (Shernell): add GreeneryRecord (or your flora entities)
    %%   + relationships to User.
    %% M2 Fauna (Renee): add FaunaSighting (or your fauna entities)
    %%   + relationships.
    %% M4 Alerts (Angelyn): add Alert/Notification entities
    %%   + relationships.
    %% ----------------------------------------------------------------
```

<!-- M1 Flora (Shernell): add GreeneryRecord (or your flora entities) + relationships to User -->
<!-- M2 Fauna (Renee): add FaunaSighting (or your fauna entities) + relationships -->
<!-- M4 Alerts (Angelyn): add Alert/Notification entities + relationships -->

## Notes

- The exported image (`er-diagram.png`) is generated from the Mermaid source
  above via [mermaid.live](https://mermaid.live). After adding new entities,
  re-export the PNG so it stays in sync with this source.
- Member 3 entities map directly to the Sequelize models in
  `backend/src/models/` - see `design/klemens/database-schema.md` for the full
  column-level schema.
