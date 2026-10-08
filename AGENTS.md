# AGENTS — Robex

## 1. Purpose

Tài liệu này định nghĩa vai trò, quyền hạn, handoff và review workflow cho các agent tham gia dự án Robex.

Mục tiêu:

- tránh agent giẫm chân nhau
- giữ scope rõ
- dùng evidence thay vì claim
- dùng GitHub làm source of truth chung

---

# 2. Team

## Human

Role:

Final Authority.

Responsibilities:

- product acceptance
- human testing
- merge approval
- release approval
- mainnet approval
- destructive Git decisions

Human giữ quyền cuối cùng.

---

## ChatGPT

Role:

Planner / Orchestrator.

Responsibilities:

- viết SPEC / Plan, business flow, state matrix và acceptance criteria trước implementation
- giữ product context và PRD / Architecture / Design intent
- chia task, xác định dependency và phạm vi
- điều phối nhiệm vụ **cho Builder do Owner lựa chọn**; không tự chọn Gemini hay Grok
- điều phối review, đọc GitHub state, giải quyết conflict giữa findings

ChatGPT không mặc định là coder. Không giao code khi Owner chưa chỉ định Builder và cho phép triển khai.

---

## Gemini (Antigravity) và Grok

Role:

**Builder — ngang quyền, cùng trách nhiệm và phạm vi có thể đảm nhận.** Không có Builder mặc định.

**Owner chọn ai làm Builder cho từng Plan/task. Nhiệm vụ giao cho ai thì người đó thực hiện** và chịu trách nhiệm các việc sau:

- implementation và tích hợp theo SPEC được duyệt
- feature/integration tests
- runtime, screenshot và RPC evidence theo yêu cầu
- post-review fix commits và Builder handoff
- báo blocker và đề xuất thay đổi scope để Owner/ChatGPT quyết định; không tự mở rộng

Builder không được tự approve, tự merge, hoặc tự chuyển nhiệm vụ cho Builder còn lại.

Một task có **một Builder chịu trách nhiệm chính**. Chỉ chạy song song nếu Owner chủ động giao riêng các task không chồng chéo và chỉ định người tích hợp. Builder handoff là claim, không phải independent QA.

---

## Codex CLI

Role:

Independent Reviewer / QA.

Responsibilities:

- inspect source
- inspect diff
- run tests
- verify runtime evidence
- identify regression
- challenge Builder claims
- verify acceptance criteria
- issue review verdict

Allowed verdicts:

- PASS
- PASS WITH LIMITATION
- FAIL
- BLOCKER

Codex không được tự sửa feature rồi tự approve cùng change.

---

## Opus 4.6

Role:

Limited-Quota Specialist.

Chỉ dùng khi giá trị reasoning cao.

Preferred use cases:

- difficult architecture trade-off
- difficult security review
- ambiguous root-cause analysis
- hard bug investigation
- important design critique
- second opinion trước quyết định khó đảo ngược

Không dùng cho:

- routine coding
- normal refactor
- simple tests
- repetitive documentation
- standard review

Quota phải được bảo vệ.

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

Không dùng chat transcript làm source of truth cho code state.

---

# 4. Default Workflow

```text
ChatGPT writes SPEC / feature Plan + state / responsive matrix
↓
Human approves Plan
↓
Owner selects Gemini OR Grok and authorizes implementation
↓
Assigned Builder: feature branch → implementation → self-tests
↓
Assigned Builder: runtime evidence → scoped commit → push → PR → STOP
↓
ChatGPT checks handoff and assigns independent review
↓
Codex independent QA
↓
Assigned Builder fix commit (if needed) → Codex re-review
↓
Human Acceptance (last gate)
↓
Owner authorizes merge
```

Opus chỉ được chèn vào khi task cần specialist reasoning.

---

# 5. Task Ownership

Mỗi task có một primary owner và Builder được ghi rõ trong Plan/task handoff.

- implementation → **Gemini hoặc Grok, do Owner chọn riêng từng task**; không mặc định
- independent QA → Codex
- SPEC / orchestration / review coordination → ChatGPT
- Plan approval / Builder selection / Human Acceptance / merge → Owner
- specialist escalation → Opus, chỉ khi có lý do phù hợp

Không để hai Builder cùng primary-own một implementation task. Không đổi người phụ trách khi Owner chưa đồng ý.

---

# 6. No Parallel Editing Rule

Không cho hai agent sửa cùng ownership area cùng lúc nếu chưa có explicit approval.

Ví dụ không được:

```text
Gemini edits SwapCard.tsx
Grok edits SwapCard.tsx
```

cùng thời điểm.

Nếu cần parallel work thì phải chia ranh giới rõ.

---

# 7. Scope Rule

Agent không được tự mở rộng feature.

Nếu phát hiện idea mới:

- ghi proposal
- mô tả benefit
- mô tả impact
- chờ orchestration decision

Không tự implement.

---

# 8. Evidence Rule

Agent output không phải evidence.

Mỗi claim phải có loại evidence phù hợp.

Examples:

UI claim  
→ runtime screenshot

Logic claim  
→ automated tests

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
- Codex says pass

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

Mainnet là human-only gate.

---

# 20. Opus Escalation Rule

Chỉ gọi Opus khi ít nhất một điều đúng:

1. vấn đề khó và Builder được chỉ định / Codex chưa giải quyết chắc chắn
2. quyết định architecture có chi phí đảo ngược cao
3. security risk nghiêm trọng
4. design decision quan trọng cần second opinion
5. bug khó, ambiguous, hoặc cross-layer

Nếu không, không dùng Opus.

---

# 21. Conflict Resolution

Nếu Builder được chỉ định và Codex bất đồng:

```text
ChatGPT
→ đọc spec
→ đọc evidence
→ phân loại disagreement
```

Nếu vẫn chưa rõ:

```text
Opus
→ specialist second opinion
```

Human quyết định cuối.

---

# 22. Communication Style

Agent report phải:

- ngắn
- có cấu trúc
- phân biệt fact / assumption
- ghi rõ limitation
- không dùng “DONE” nếu thiếu evidence

---

# 23. Five Golden Rules

1. Design/spec first.
2. One builder, one independent reviewer.
3. No DONE without evidence.
4. Fix systems, not symptoms.
5. Human Acceptance before merge/release.
