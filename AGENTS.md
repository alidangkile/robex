# AGENTS — Robex

> Cập nhật 2026-10-11: đội hình mới do Owner quyết định. Claude thay ChatGPT (Planner/Orchestrator); Gemini là Builder; Grok là QA độc lập. Codex và Opus không còn trong quy trình.

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
- chuyển prompt do Claude soạn cho Gemini / Grok (Claude không điều khiển trực tiếp các agent chạy trên máy Owner)

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
- soạn prompt giao việc cho Gemini (build) và Grok (QA)
- đọc GitHub state (branch, PR, issue, commit), review kết quả, báo cáo tiến độ cho Owner
- giữ `HANDOFF.md` luôn đúng với trạng thái thật trên GitHub

Claude không mặc định là coder và không merge. Claude có thể tạo branch / PR cho thay đổi tài liệu khi Owner yêu cầu.

Giới hạn cần biết:

- Claude không tự nhớ trọn giữa các cuộc trò chuyện; `HANDOFF.md` và Plan trong repo là bộ nhớ chung.
- Kết nối GitHub hiện tại chưa đọc được check runs / CI; vì vậy CI phải hiển thị kết quả trên PR.

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

## Grok

Role:

Independent QA / Reviewer (kiểm thử độc lập).

Responsibilities:

- inspect source và diff
- chạy tests, lint, typecheck, build
- verify runtime evidence
- identify regression (lỗi tái phát)
- challenge Builder claims (chất vấn lời khẳng định của Builder)
- verify acceptance criteria
- issue review verdict (ra kết luận)

Allowed verdicts:

- PASS
- PASS WITH LIMITATION
- FAIL
- BLOCKER

Grok **chỉ báo lỗi, không tự sửa code** rồi tự approve. Gemini sửa, Grok re-review.

Ngoại lệ chuyển tiếp: Grok là Builder của PR #14 (Plan 003B Stage B) và hoàn tất PR đó tới khi Owner merge. Vai QA áp dụng từ task tiếp theo.

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

---

# 4. Default Workflow

```text
Owner nêu ý tưởng / nhu cầu
↓
Claude nghiên cứu → viết SPEC / Plan + acceptance criteria
↓
Owner duyệt Plan
↓
Claude soạn prompt cho Gemini → Owner chuyển prompt
↓
Gemini: feature branch → implementation → self-tests → evidence → PR → STOP
↓
Claude soạn prompt QA cho Grok → Owner chuyển prompt
↓
Grok independent QA → verdict + findings trên PR
↓
Gemini fix commit (nếu cần) → Grok re-review
↓
Claude review cuối + báo cáo cho Owner bằng ngôn ngữ đời thường
↓
Human Acceptance (gate cuối)
↓
Owner merge
```

---

# 5. Task Ownership

Mỗi task có một primary owner được ghi rõ trong Plan / task handoff.

- implementation → Gemini
- independent QA → Grok
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

Nếu Gemini (Builder) và Grok (QA) bất đồng:

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
