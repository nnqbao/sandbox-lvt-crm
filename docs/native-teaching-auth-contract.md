# Native contract: Lớp học (teaching) + vân tay / Face ID + passkey

Backend lives in `convex/` (this repo). All calls use the existing raw-HTTP Convex clients
(`/api/query|mutation|action`, `{"path","args","format":"json"}`). Arrays come back wrapped as
`{"items": [...]}` by the native clients. Dates are `YYYY-MM-DD` (Vietnam calendar).

## 1. Lớp học (owner decision 2026-10-24: "Đủ cho giáo viên")

Rename the menu/tab/screen title **"Lớp chủ nhiệm" → "Lớp học"** (Android tab string "Lớp học").
Inside Lớp học, five sections (segmented tabs / chips):

| Section | Content |
|---|---|
| Tổng quan | Card "Tiết dạy hôm nay" (time, class · subject, "Đã ghi sổ"/"Chưa ghi sổ") + card "Học sinh vắng hôm nay" for the GVCN (from `homeroomReports:overview` classes: counts.absent_*; saved=false → "Chưa điểm danh"); tapping a class opens the existing class detail. |
| Lớp chủ nhiệm | The EXISTING homeroom screen content (class list, detail, attendance, roster, management). Class detail gets a new tab **"Sổ đầu bài"** (`lessonLogs:listForClass`, week stepper). |
| Lớp giảng dạy | Classes the teacher teaches, sorted by next lesson (nearest first). Tap → **Sổ đầu bài** sheet: Ngày dạy (≤ today), Tiết (lessons of that teacher in that class on that date), 1–5 stars, "Đánh giá tiết học" text, Lưu. |
| Lịch dạy | Teacher's own schedule: Danh sách (by day, per month), Tuần (Thứ 2–6 × 10 tiết grid), Tháng. |
| Học bạ | Class list (grouped by khối) → students → student record: year chips (Khối x · Lớp y, ĐTB năm), table per subject: HK I scores + ĐTB HK I, HK II scores + ĐTB HK II, Cả năm; row "ĐTB các môn". **Thêm điểm** when `writableSubjectIds` non-empty: Môn (if >1), Loại kiểm tra, Điểm số (0–10, ≤2 decimals, comma or dot), Học kỳ (default from `semester2StartDate`). Tap own score (`canEdit`) → sửa / xóa. |

Settings screens (Thiết lập giáo viên / lịch dạy / môn học / loại kiểm tra) stay **web only**.

### Functions
- `lessonLogs:myTeaching {schoolYearId}` → `{year:{_id,name,startDate,endDate,semester2StartDate,locked}, today, holidays:[ymd], slots:[{_id,classId,weekday(1=Thứ 2..5=Thứ 6),session:"morning"|"afternoon",period:1..5,teacherId,subjectId,effectiveFrom,effectiveTo?}], classes:[{_id,name,gradeLevel,status}], todayLogs:[{_id,classId,date,session,period,rating,comment}]}`
- `teachingCatalog:catalog {}` → `{subjects:[{_id,name,code,active}], testTypes:[{_id,name,coefficient,active}]}`
- `lessonLogs:myLogsFor {classId,date}` → `[{_id,session,period,rating,comment,updatedAt}]`
- `lessonLogs:save {classId,date,session,period,rating,comment}` (mutation)
- `lessonLogs:listForClass {classId,from,to}` (≤ 93 days) → `[{_id,date,session,period,teacherName,subjectName,rating,comment,createdAt,updatedAt}]`
- `teachers:schedule {schoolYearId}` → `{year, teacher:{_id,name}, holidays, slots, currentSlotCount, teachingClassIds, classes:[{_id,name,gradeLevel}]}`
- `gradebook:myClasses {schoolYearId}` → `{year, classes:[{_id,name,gradeLevel,rosterCount,isHomeroom,subjectIds}]}`
- `gradebook:classStudents {classId}` → `{class:{_id,name,gradeLevel}, year, students:[{_id,fullName,studentCode,dateOfBirth,rosterNumber|null}]}`
- `gradebook:studentRecord {studentId, schoolYearId?}` → `{student:{_id,fullName,studentCode,dateOfBirth}, years:[{_id,name,startDate,endDate,semester2StartDate,locked,classId,className,gradeLevel}], yearSummaries:[{schoolYearId,semester1,semester2,year}], selectedYearId, selectedClassId, fullView, subjects:[{_id,name,active}], testTypes:[{_id,name,coefficient}], subjectIds:[...], writableSubjectIds:[...], summary:{subjects:[{subjectId,semester1,semester2,year}],semester1,semester2,year}, entries:[{_id,subjectId,semester,testTypeId,testTypeName,coefficient,score,createdAt,updatedAt,enteredByName,canEdit}]}` (averages may be null)
- `gradebook:addEntry {studentId,classId,subjectId,semester,testTypeId,score}`, `gradebook:updateEntry {id,semester,testTypeId,score}`, `gradebook:removeEntry {id}`

### Timetable expansion (mirror `src/lib/teachingSchedule.js`)
A slot applies on `date` when `weekday == isoWeekday(date)` (1=Mon..5=Fri), `effectiveFrom <= date` and
(`effectiveTo` absent or `date <= effectiveTo`), the date is inside the year and not in `holidays`.
Period start times: morning `07:00 07:50 08:50 09:40 10:30`, afternoon `13:30 14:20 15:20 16:10 17:00`
(45-minute periods). Labels: "Tiết 3 sáng", "Tiết 1 chiều"; weekdays "Thứ 2".."Thứ 6".
"Next lesson" for a class = first lesson today whose end time ≥ now, else the first later day (look 35 days ahead).

### Bán trú
Visibility now follows `menuAccess["boarding"]` (server fills it from Báo cáo for older groups);
admin/moderator always.

## 2. Vân tay / Face ID (device key) — owner decision: "Khóa thiết bị"

Enable (Profile → "Bảo mật" → switch "Đăng nhập bằng Face ID/Touch ID/vân tay"), only when signed in:
1. Create a P-256 key that can only be used after a biometric check:
   - iOS: Secure Enclave key (`kSecAttrTokenIDSecureEnclave`, `kSecAttrKeyTypeECSECPrimeRandom`, 256), access control
     `kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly` + `[.privateKeyUsage, .biometryCurrentSet]`, permanent, own tag.
   - Android: `AndroidKeyStore` EC secp256r1, `PURPOSE_SIGN`, `DIGEST_SHA256`, `setUserAuthenticationRequired(true)`,
     API 30+: `setUserAuthenticationParameters(0, AUTH_BIOMETRIC_STRONG)`, `setInvalidatedByBiometricEnrollment(true)`;
     sign through `BiometricPrompt` with a `CryptoObject(Signature("SHA256withECDSA"))`.
2. `deviceAuth:deviceRegisterChallenge {}` (mutation, signed in) → `{challengeId, challenge}`.
3. Sign UTF-8 `lvt-crm:device_register:{challengeId}:{challenge}` (ECDSA P-256 SHA-256, DER signature).
4. `deviceAuth:registerDeviceKey {challengeId, publicKey, signature, deviceName, platform, replaceCredentialId?}` (action)
   → `{credentialId}`. `publicKey` base64: iOS `SecKeyCopyExternalRepresentation` (raw 65-byte point) / Android
   `publicKey.encoded` (SPKI). `platform` = `"ios"` / `"android"`. Store `credentialId` + account email/name locally
   (Keychain / EncryptedSharedPreferences); pass the old credentialId as `replaceCredentialId` when re-enabling for the same account.
Sign in (login screen button, shown only when a local device credential exists, label includes the saved email):
1. `deviceAuth:deviceLoginChallenge {}` (mutation, NOT authenticated) → `{challengeId, challenge}`.
2. Biometric prompt, sign UTF-8 `lvt-crm:device_login:{challengeId}:{challenge}`.
3. `auth:signIn {provider:"device-key", params:{credentialId, challengeId, signature}}` (action, not authenticated) →
   `{tokens:{token, refreshToken}}` — then EXACTLY the same steps as the password sign-in (save tokens, sessionContext,
   publish → mustChangePassword gate still applies, register device session).
   If the error contains `DEVICE_CREDENTIAL_INVALID`, delete the local key + credential and tell the user to sign in
   with the password and enable it again. Biometric change (new fingerprint/face) invalidates the key → same handling.
Disable: `deviceAuth:removeMine {credentialId}` (mutation, signed in; best-effort) + delete the local key.
Sign-out keeps the local key (that is the point of fingerprint login). A password sign-in as a DIFFERENT account must not
show the other account's switch as on.

## 3. Passkey — owner decision: app only (Android + iOS), RP id `lvt.vscgroup.io.vn`

Create (Profile → "Tạo passkey", signed in):
1. `deviceAuth:passkeyRegistrationOptions {}` (action) → `{challengeId, options}`; `options` is a JSON STRING of
   PublicKeyCredentialCreationOptionsJSON (base64url fields: `challenge`, `user.id`, `excludeCredentials[].id`).
2. iOS: `ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: rp.id)
   .createCredentialRegistrationRequest(challenge: b64url(challenge), name: user.name, userID: b64url(user.id))`;
   build RegistrationResponseJSON `{id, rawId (b64url credentialID), type:"public-key", authenticatorAttachment:"platform",
   response:{clientDataJSON, attestationObject (b64url raw*), transports:["internal","hybrid"]}, clientExtensionResults:{}}`.
   Android: `CredentialManager.createCredential(activity, CreatePublicKeyCredentialRequest(options))` →
   `CreatePublicKeyCredentialResponse.registrationResponseJson` (send as is).
3. `deviceAuth:registerPasskey {challengeId, response (JSON string), deviceName, platform}` (action).
Sign in (login screen button "Đăng nhập bằng passkey", always shown in sign-in mode on supported OS):
1. `deviceAuth:passkeyLoginOptions {}` (action, NOT authenticated) → `{challengeId, options}` (no allowCredentials).
2. iOS: `createCredentialAssertionRequest(challenge:)` → AuthenticationResponseJSON `{id, rawId, type:"public-key",
   authenticatorAttachment:"platform", response:{clientDataJSON, authenticatorData, signature, userHandle}, clientExtensionResults:{}}`.
   Android: `GetCredentialRequest(listOf(GetPublicKeyCredentialOption(options)))` → `PublicKeyCredential.authenticationResponseJson`.
3. `auth:signIn {provider:"passkey", params:{challengeId, response}}` → tokens → same steps as password sign-in.
Domain association (served by `scripts/serve-production.mjs`): iOS `webcredentials:lvt.vscgroup.io.vn` (app id
`42ZDDJ2B8M.vn.lvt.crm.uikit`), Android assetlinks for `lvt.crm` + release cert SHA-256.
User cancellation is silent (no error banner).

## 4. Errors to humanize (Vietnamese)
CHALLENGE_INVALID "Phiên xác thực đã hết hạn. Vui lòng thử lại." · DEVICE_CREDENTIAL_INVALID "Vân tay / Face ID hoặc passkey
trên máy này không còn hiệu lực. Đăng nhập bằng mật khẩu rồi bật lại." · DEVICE_SIGNATURE_INVALID "Không xác thực được thiết bị."
· PASSKEY_VERIFICATION_FAILED "Không xác thực được passkey." · DEVICE_CREDENTIAL_LIMIT "Tài khoản đã có tối đa 10 thiết bị đăng
nhập nhanh." · LESSON_NOT_SCHEDULED "Bạn không có tiết này ở lớp vào ngày đã chọn." · LESSON_IN_FUTURE "Chưa thể ghi Sổ đầu bài cho
tiết chưa diễn ra." · INVALID_RATING "Chọn từ 1 đến 5 sao." · INVALID_SCORE "Điểm từ 0 đến 10, tối đa 2 chữ số thập phân." ·
GRADE_SUBJECT_FORBIDDEN "Bạn chỉ nhập điểm môn mình dạy ở lớp này." · GRADEBOOK_FORBIDDEN "Bạn không phụ trách lớp của học sinh
này." · SCHOOL_YEAR_LOCKED "Năm học đã khóa." · TEST_TYPE_NOT_FOUND "Loại kiểm tra không còn." · SUBJECT_NOT_FOUND "Môn học không còn."
