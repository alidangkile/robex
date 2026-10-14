# AGENTS — Robex

> Cập nhật 2026-10-11: đội hình mới do Owner quyết định. Claude thay ChatGPT (Planner/Orchestrator); Gemini là Builder; Grok là QA độc lập. Codex và Opus không còn trong quy trình.
>
> Cập nhật 2026-10-11 17:15 (UTC+7): **Grok hết hạn mức (quota). QA tạm thời: Claude Code**, cho tới khi Owner chuyển lại cho Grok. Xem mục "Claude Code (QA tạm thời)".
>
> Cập nhật 2026-10-14: thêm **Risk Tier A/B/C** và giới hạn vòng QA (mục 4.1), **QA Phần 2 — UX** (mục 3.1), `CONSTRAINTS.md` (luật sàn) và agent skills ghim phiên bản trong `.agents/skills/` (mục 23). Claude Code QA dùng `gh` để đọc CI và comment.

## 1. Purpose

Tài liệu này định nghĩa vai trò, quyền hạn, handoff (bàn giao) và review workflow (quy trình kiểm tra) cho các agent tham gia dự án Robex.

Mục tiêu:

- tránh agent giẫm chân nhau
- giữ scope (phạm vi) rõ
- dùng evidence (bằng chứng) thay vì claim (lời khẳng định)
- dùng GitHub làm source of truth (nguồn sự thật) chung

---

# 2. Team

## Human / Owner

Role:

Final Authority (quyền quyết định cuối cùng).

Responsibilities:

- duyệt Plan
- product acceptance và human testing (tự thử app)
- merge approval
- release approval
- mainnet approval
- destructive Git decisions (quyết định Git không đảo ngược được)
- chuyển prompt (hoặc số issue) do Claude soạn cho Gemini / QA agent (Claude không điều khiển trực tiếp các agent chạy trên máy Owner)
- chọn agent làm QA khi agent hiện tại không dùng được (vd. hết quota)

Human giữ quyền cuối cùng.

---

## Claude

Role:

Mentor / Planner / Orchestrator / Final Reviewer.

Responsibilities:

- giải thích thuật ngữ và kỹ thuật cho Owner bằng tiếng Việt, ghi chú nghĩa bên cạnh từ tiếng Anh
- nghiên cứu, brainstorm ý tưởng
- viết SPEC / Plan, business flow, state matrix và acceptance criteria trước implementation
- giữ product context và PRD / Architecture / Design intent
- chia task, xác định dependency và phạm vi
- soạn prompt giao việc cho Gemini (build) và QA agent, hoặc ghi nhiệm vụ thành GitHub issue
- đọc GitHub state (branch, PR, issue, commit, comment), review kết quả, báo cáo tiến độ cho Owner
- giữ `HANDOFF.md` luôn đúng với trạng thái thật trên GitHub

Claude không mặc định là coder và không merge. Claude có thể tạo branch / PR cho thay đổi tài liệu khi Owner yêu cầu.

Giới hạn cần biết:

- Claude không tự nhớ trọn giữa các cuộc trò chuyện; `HANDOFF.md` và Plan trong repo là bộ nhớ chung.
- Claude không xem được màn hình Antigravity hay terminal của Owner; Claude chỉ đọc được những gì agent ghi lên GitHub (xem mục 3.1).
- Kết quả CI vẫn phải được chép vào comment trên PR (xem mục 3.1) để mọi người đọc được ở một chỗ; QA (Claude Code) đối chiếu với log Actions bằng `gh`.
- Môi trường của Claude không gọi được RPC blockchain; bằng chứng on-chain phải do QA agent tái lập.

---

## Gemini

Role:

Builder (người viết code).

Responsibilities:

- implementation và tích hợp theo SPEC được duyệt
- feature / integration tests
- runtime, screenshot và RPC evidence theo yêu cầu
- post-review fix commits (sửa lỗi sau review bằng commit mới)
- Builder handoff
- báo blocker (vật cản) và đề xuất thay đổi scope để Owner / Claude quyết định; không tự mở rộng

Builder không được tự approve, tự merge, hoặc tự chuyển nhiệm vụ cho agent khác. Builder handoff là claim, không phải independent QA.

---

## QA agent (kiểm thử độc lập)

Vai trò QA hiện do **Claude Code** đảm nhận tạm thời (Grok hết quota). Owner có thể chuyển lại cho Grok bất cứ lúc nào; khi chuyển, ghi vào `HANDOFF.md`.

Responsibilities (áp dụng cho bất kỳ agent nào làm QA):

- inspect source và diff
- chạy tests, lint, typecheck, build
- verify runtime evidence và tái lập bằng chứng on-chain (RPC chỉ đọc)
- identify regression (lỗi tái phát)
- challenge Builder claims (chất vấn lời khẳng định của Builder)
- verify acceptance criteria
- issue review verdict (ra kết luận)

Allowed verdicts:

- PASS
- PASS WITH LIMITATION
- FAIL
- BLOCKER

QA **chỉ báo lỗi, không tự sửa code** rồi tự approve. Gemini sửa, QA re-review. QA ghi rõ mục nào đã kiểm và mục nào chưa kiểm (`Not checked`).

### Claude Code (QA tạm thời)

- Chạy trên máy Owner (có mạng tới RPC testnet), trong một phiên riêng, tách khỏi Claude (Orchestrator) trong chat.
- Cấu hình khuyến nghị: model `opus`; effort `medium` cho QA tài liệu, `high` cho QA code; thêm `ultrathink` vào prompt cho phần ký giao dịch / bảo mật.
- Owner **từ chối** mọi yêu cầu sửa/tạo file của Claude Code khi đang làm QA; chỉ cho phép đọc file, chạy test/lint/typecheck/build, gọi RPC chỉ đọc, comment lên GitHub.
- Ký tên `Agent: Claude Code (QA)` trong mọi comment.
- Lưu ý độc lập: QA (Claude Code) và final review (Claude) cùng họ model, nên dễ có cùng điểm mù. Claude (final review) phải soi kỹ các mục QA ghi `Not checked`.

### Grok

- QA chính khi có quota. Đã làm Builder của PR #14 (Plan 003B Stage B, đã merge) và QA của #23, #24, #27.

---

# 3. GitHub as Source of Truth

GitHub là trạm trung chuyển chính.

GitHub lưu:

- branches
- commits
- Pull Requests
- diffs
- review comments
- evidence links
- CI results
- issue tracking
- release history

Không dùng chat transcript làm source of truth cho code state. Evidence phải nằm trong repo hoặc trên PR; không dẫn đường dẫn tới máy cá nhân mà người khác không mở được.

## 3.1 Reporting Convention (quy ước báo cáo)

Mục đích: Owner không phải copy-paste kết quả từ Antigravity / terminal sang Claude. **Việc gì chưa được ghi lên GitHub thì coi như chưa được báo cáo.**

### Nhận việc

- Nhiệm vụ có thể được giao bằng prompt hoặc bằng **GitHub issue**. Nếu được giao "làm issue #N", agent đọc toàn bộ issue và comment trước khi bắt đầu.
- Khi bắt đầu, agent comment vào issue: `STARTED: <agent> — branch <tên-branch>`.

### Gemini (Builder)

- Báo cáo đầy đủ trong **PR description** theo mục 9 và mục 14.
- Mỗi lần push thêm commit (fix, cập nhật), viết **một PR comment mới** mở đầu bằng:

```text
BUILDER UPDATE: <commit SHA ngắn>
- Thay đổi: ...
- Đã chạy: lint / typecheck / test / build → kết quả
- Còn lại / câu hỏi: ...
```

- Không sửa lại nội dung báo cáo cũ để che lịch sử; thêm comment mới.
- Lấy commit SHA từ `git rev-parse HEAD`; không gõ từ trí nhớ.

### QA agent

- Ghi kết luận thành **PR comment** (hoặc PR review), dòng đầu cố định:

```text
QA VERDICT: PASS | PASS WITH LIMITATION | FAIL | BLOCKER — commit <SHA ngắn>
```

- Dòng tiếp theo: `Agent: <tên agent> (QA)`.
- Sau đó liệt kê findings, mỗi finding có: mã (`QA-01`, `QA-02`...), mức độ (BLOCKER / HIGH / MEDIUM / LOW / INFO), file và dòng, mô tả, cách tái hiện, bằng chứng.
- Ghi rõ đã kiểm tra những gì và **chưa** kiểm tra được những gì.
- Verdict có 2 phần:
  - **Phần 1 — Kỹ thuật:** source, diff, tests, CI, bằng chứng on-chain, 5 điểm "Guard the bar" trong `CONSTRAINTS.md`.
  - **Phần 2 — UX** (bắt buộc khi PR đổi thứ người dùng thấy): chạy app, chụp màn hình bằng Playwright ở desktop + mobile, đọc từng dòng chữ (copy), kiểm tra trạng thái loading / lỗi / rỗng, số hiển thị có làm tròn và đúng đơn vị không. Mã finding: `UX-01`, `UX-02`...
- Finding LOW / INFO không chặn merge: ghi vào issue **#42 (Hardening backlog)** và tham chiếu trong verdict.

### Kết quả CI

- Agent nào push code thì sau khi CI chạy xong phải comment tóm tắt trên PR:

```text
CI RESULT: <PASS | FAIL> — commit <SHA ngắn> — <link tới Actions run>
- lint: ✅/❌
- typecheck: ✅/❌
- test: ✅/❌ (số test pass/fail, ghi rõ lấy từ log Actions hay chạy local)
- build: ✅/❌
- re-run: không | có (lý do, test nào fail lần đầu)
```

- Nếu CI fail, chép dòng lỗi chính (ngắn gọn) vào comment.

### Chung

- Mọi comment ghi tên agent và commit SHA.
- Không đưa secret, private key, seed phrase, RPC URL có token vào comment.
- Owner chỉ cần nhắn Claude "kiểm tra PR #N" hoặc "kiểm tra issue #N"; Claude tự đọc trên GitHub.

---

# 4. Default Workflow

```text
Owner nêu ý tưởng / nhu cầu
↓
Claude nghiên cứu → viết SPEC / Plan + acceptance criteria
↓
Owner duyệt Plan
↓
Claude soạn prompt hoặc tạo issue cho Gemini → Owner chuyển prompt / số issue
↓
Gemini: feature branch → implementation → self-tests → evidence → PR → STOP
↓
Claude soạn prompt QA → Owner chuyển cho QA agent (hiện tại: Claude Code)
↓
QA independent → QA VERDICT + findings trên PR
↓
Gemini fix commit (nếu cần) → BUILDER UPDATE → QA re-review
↓
Claude đọc PR, review cuối + báo cáo cho Owner bằng ngôn ngữ đời thường
↓
Human Acceptance (gate cuối)
↓
Owner merge
```

## 4.1 Risk Tier (mức rủi ro) và giới hạn vòng QA

Claude ghi Tier trong SPEC / issue; Builder chép Tier vào PR description. Nếu không chắc, chọn Tier cao hơn.

| Tier | Khi nào | QA | Human Acceptance |
|---|---|---|---|
| **A** | Đụng tiền hoặc ký: calldata, `eth_sendTransaction`, approve / Permit2, pre-send checks, bất kỳ dòng nào trong "Protected values" của `CONSTRAINTS.md` | Claude Code `opus` effort `high` + `ultrathink`; Phần 1 + Phần 2 | Bắt buộc, Owner tự thử trên testnet |
| **B** | UI, logic hiển thị, gọi RPC chỉ đọc, wallet request không ký tiền (vd. `wallet_watchAsset`) | `opus` effort `high`; Phần 1 + Phần 2 | Owner xem nhanh màn hình |
| **C** | Chỉ tài liệu, cấu hình agent, CI không đổi logic | `opus` effort `medium`; Phần 1 rút gọn | Không bắt buộc |

Giới hạn vòng:

- Tối đa **2 vòng QA** cho một PR (vòng 1 + 1 lần re-review sau fix).
- Sau vòng 2 còn BLOCKER / HIGH ⇒ dừng, Claude báo Owner để quyết định: chia nhỏ PR, sửa SPEC, hoặc chấp nhận có giới hạn.
- Sau vòng 2 chỉ còn MEDIUM ⇒ Owner chọn sửa thêm 1 commit (QA chỉ kiểm commit đó) hoặc chuyển vào #42.
- LOW / INFO không bao giờ làm phát sinh vòng mới.

---

# 5. Task Ownership

Mỗi task có một primary owner được ghi rõ trong Plan / task handoff.

- implementation → Gemini
- independent QA → QA agent (hiện tại: Claude Code; chính thức: Grok khi có quota)
- SPEC / orchestration / mentoring / review cuối / báo cáo → Claude
- Plan approval / Human Acceptance / merge → Owner

Owner có thể đổi người phụ trách cho từng task; khi đổi phải ghi vào Plan và `HANDOFF.md`. Builder và QA của cùng một task phải là hai agent khác nhau.

---

# 6. No Parallel Editing Rule

Không cho hai agent sửa cùng ownership area cùng lúc nếu chưa có explicit approval.

Nếu cần parallel work thì phải chia ranh giới rõ và chỉ định người tích hợp.

---

# 7. Scope Rule

Agent không được tự mở rộng feature.

Nếu phát hiện idea mới:

- ghi proposal
- mô tả benefit
- mô tả impact
- chờ Owner / Claude quyết định

Không tự implement.

---

# 8. Evidence Rule

Agent output không phải evidence.

Mỗi claim phải có loại evidence phù hợp.

Examples:

UI claim  
→ runtime screenshot

Logic claim  
→ automated tests (ưu tiên kết quả CI trên PR)

Wallet claim  
→ real wallet runtime

Transaction claim  
→ tx hash / receipt

On-chain claim  
→ RPC / contract read

Responsive claim  
→ viewport evidence

---

# 9. Builder Handoff

Builder handoff phải có:

- task
- what changed
- files changed
- tests run
- runtime verification
- screenshots nếu có UI
- known limitations
- open questions
- commit hash
- PR link

Không dùng chỉ:

“Done.”

---

# 10. Review Rule

Reviewer phải kiểm độc lập.

Không tin Builder summary nếu chưa kiểm source/evidence.

Review phải phân biệt:

- implementation defect
- environment limitation
- missing evidence
- non-blocking improvement

---

# 11. Post-Review Fix Rule

Fix sau review phải là commit mới.

Không silent rewrite reviewed code.

Flow:

```text
Review finding
↓
Fix commit
↓
Focused re-review
```

---

# 12. Human Acceptance

Human Acceptance là gate cuối.

Không merge chỉ vì:

- tests pass
- Builder says done
- QA says pass
- Claude says pass

Nếu feature có UX/runtime behavior quan trọng, Human phải test trước merge.

---

# 13. Git Safety

Agent được phép:

- create branch
- inspect status
- inspect diff
- stage scoped files
- commit
- push feature branch
- create/update PR
- comment trên issue / PR

Human-controlled:

- merge main
- force push
- reset --hard
- delete important branch
- production release
- mainnet deployment

---

# 14. PR Requirements

Mỗi PR phải có:

- Goal
- Scope
- Non-goals
- Acceptance criteria
- Files changed
- Test evidence
- Runtime evidence
- Screenshot evidence nếu có UI
- Known limitations
- Risk notes

Ưu tiên PR nhỏ: một PR làm một việc. PR lớn phải được chia trong Plan trước khi code.

---

# 15. Design Review

UI change đáng kể phải có:

- desktop wide evidence
- desktop narrow evidence
- tablet evidence
- mobile evidence

Reviewer kiểm:

- hierarchy
- spacing
- typography
- overflow
- clipping
- state clarity
- financial readability
- responsive behavior

---

# 16. Root Cause Rule

Không vá triệu chứng nếu root cause nằm ở architecture.

Ví dụ:

Không sửa layout lệch bằng magic number nếu nguyên nhân là grid sai.

---

# 17. Refactor Rule

Không refactor chỉ vì code chưa đẹp.

Refactor chỉ khi có payoff rõ:

- giảm bug
- giảm duplication
- giảm coupling
- tăng maintainability

---

# 18. Abstraction Rule

Không over-abstract sớm.

Chỉ tạo shared abstraction khi pattern đã lặp lại đủ rõ.

---

# 19. Mainnet Rule

Không agent nào được tự:

- đổi network sang mainnet
- deploy mainnet
- dùng production key
- release production

Mainnet là human-only gate. Trước khi bất kỳ tính năng nào xử lý tiền thật trên mainnet, cần security audit bởi con người có chuyên môn; AI review không thay thế bước này.

Không agent nào được nhận, lưu hoặc yêu cầu seed phrase / private key.

---

# 20. Conflict Resolution

Nếu Gemini (Builder) và QA agent bất đồng:

```text
Claude
→ đọc spec
→ đọc evidence
→ phân loại disagreement
→ giải thích cho Owner bằng ngôn ngữ đời thường
```

Human quyết định cuối.

---

# 21. Communication Style

Agent report phải:

- ngắn
- có cấu trúc
- phân biệt fact / assumption
- ghi rõ limitation
- không dùng “DONE” nếu thiếu evidence

Báo cáo gửi Owner: tiếng Việt, ghi chú nghĩa bên cạnh thuật ngữ tiếng Anh.

---

# 22. Five Golden Rules

1. Design/spec first.
2. One builder, one independent reviewer.
3. No DONE without evidence.
4. Fix systems, not symptoms.
5. Human Acceptance before merge/release.

---

# 23. Agent Skills và CONSTRAINTS.md

- `CONSTRAINTS.md` (gốc repo) là luật sàn: không thêm suppression, không skip test, không giảm số test, không đổi Protected values nếu SPEC không yêu cầu. Builder đọc trước khi code; QA kiểm "Guard the bar" mỗi PR.
- `.agents/skills/` chứa 5 skill của `addyosmani/agent-skills`, **chép nguyên văn, ghim commit `aeac41d`**, không có hooks. Nguồn, giấy phép MIT và hash: `.agents/skills/SOURCE.md`.
- Khi nào đọc skill nào: `.agents/rules/10-skills.md`.
- Thứ tự ưu tiên khi mâu thuẫn: `00-truthfulness.md` > `CONSTRAINTS.md` > `AGENTS.md` > skill.
- Không cài plugin agent-skills bản mới nhất (`agy plugin install`, `/plugin marketplace add`). Muốn cập nhật: PR Tier C theo hướng dẫn trong `SOURCE.md`.
