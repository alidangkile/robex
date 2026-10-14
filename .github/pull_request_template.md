## Risk Tier
<!-- A / B / C theo AGENTS.md mục 4.1, chép từ SPEC / issue -->

## Goal

## Scope

## Non-goals

## Acceptance Criteria
- [ ] 

## Truthfulness & Verification Checklist
- [ ] Mọi SHA/địa chỉ/số liệu trong PR được chép từ `npm run agent:report` hoặc output lệnh, không gõ tay
- [ ] Mọi [FACT] có nguồn; phần chưa kiểm nằm trong "Not checked"
- [ ] Đã đọc `CONSTRAINTS.md`: không thêm suppression, không skip test, số test không giảm, không đổi Protected values ngoài SPEC

## Files Changed

## Test Evidence

## Runtime Evidence

## Screenshot Evidence (nếu có UI)

## Known Limitations

## Risk Notes

---
> **Nhắc nhở (AGENTS.md mục 3.1):** Sau khi push và CI chạy xong, agent phụ trách push phải comment kết quả CI lên PR theo định dạng:
> ```text
> CI RESULT: <PASS | FAIL> — commit <SHA ngắn> — <link tới Actions run>
> - lint: ✅/❌
> - typecheck: ✅/❌
> - test: ✅/❌ (số test pass/fail)
> - build: ✅/❌
> ```
