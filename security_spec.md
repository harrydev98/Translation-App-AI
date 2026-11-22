# Security Specification — Mặc Vận Firestore Rules

## 1. Data Invariants
1. **Default Deny**: All unmatched paths are explicitly denied (`allow read, write: if false`).
2. **Verified Identity Ownership**: All user data (`userSettings`, `novels`, `chapters`, `segments`, `glossaries`) requires `request.auth != null && request.auth.token.email_verified == true`.
3. **Master Gate Relational Sync**: Every subcollection document (`chapters`, `segments`, `glossaries`) verifies via `get()` that the parent `/novels/{novelId}` exists and `data.ownerId == request.auth.uid`.
4. **Immutable Ownership & Creation Timestamps**: `ownerId`, `novelId`, `chapterId`, and `createdAt` cannot be mutated after creation (`incoming().field == existing().field`).
5. **Temporal Integrity**: `createdAt` and `updatedAt` must equal `request.time`.
6. **Strict Key & Volumetric Bounds**: All documents reject shadow keys via `keys().hasAll(...) && keys().hasOnly(...)` on create, `affectedKeys().hasOnly(...)` on update, and enforce `.size()` bounds on every string and numeric range on integers.
7. **Secure List Queries**: `allow list` never trusts client queries blindly and enforces `resource.data.ownerId == request.auth.uid` without costly `get()` calls inside list blocks.

## 2. Dirty Dozen Adversarial Payloads
1. **Unauthenticated Write**: Create novel with `request.auth == null` -> `PERMISSION_DENIED`.
2. **Unverified Email Spoof**: Write with `email_verified == false` -> `PERMISSION_DENIED`.
3. **Identity Spoofing**: Create novel with `ownerId: "victim-uid"` != `request.auth.uid` -> `PERMISSION_DENIED`.
4. **Cross-Tenant List Scraping**: List `/novels` without `where('ownerId', '==', uid)` -> `PERMISSION_DENIED`.
5. **Shadow Field Injection**: Create novel with extra key `isAdmin: true` -> `PERMISSION_DENIED`.
6. **Update-Gap Shadow Key**: Update chapter adding unknown key `bypassLimit: true` -> `PERMISSION_DENIED`.
7. **ID Poisoning**: Write document with 200-char ID or invalid characters `../admin` -> `PERMISSION_DENIED`.
8. **Orphaned Chapter Creation**: Create chapter under non-existent `novelId` -> `PERMISSION_DENIED`.
9. **Parent Hijack**: Update segment changing `novelId` or `ownerId` -> `PERMISSION_DENIED`.
10. **Client Timestamp Forgery**: Create novel with client-forged `createdAt` != `request.time` -> `PERMISSION_DENIED`.
11. **Value Poisoning / Resource Exhaustion**: Update segment `sourceText` with 50,000 characters (> 10,000 limit) -> `PERMISSION_DENIED`.
12. **Invalid Enum Injection**: Create glossary term with `category: "admin_override"` -> `PERMISSION_DENIED`.
