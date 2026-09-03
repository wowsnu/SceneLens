# 파일럿 링크

본 실험과 **번호 체계를 나눈다** — `PILOT01…`. 그래야 Supabase에서 `participant_id`로 파일럿을 골라내거나 뺄 수 있다. 본 실험 번호(`P01…`)를 파일럿에 쓰면 두 기록이 한 사람처럼 붙어 버린다.

파일럿에서 확인할 것 (프로토콜 §2·§3의 pilot 메모):

- 90–120초 장면을 생성하고 검토·수정까지 **20분이 충분한지**. 부족하면 대본을 줄이거나 시간을 늘린다.
- 대본 A/B의 난이도가 비슷한지.
- 튜토리얼 10분이 기능을 익히기에 충분한지.

그리고 **로그가 제대로 나오는지**를 여기서 반드시 확인한다 — 본 실험 첫 참가자에게서 알게 되면 그 세션은 되돌릴 수 없다:

- 내보낸 뒤 Supabase `study_sessions`에 행이 생겼는가
- 그 행의 `participant_id`·`condition`이 링크와 맞는가
- `summary.edits.byLevel`에 값이 있는가 (튜토리얼만 하고 `과제 시작`을 안 눌렀으면 전부 0이고 `summary.tutorial`에 가 있다)
- `summary.regeneration.total`이 실제로 생성한 횟수와 맞는가

---

## PILOT01 — baseline 먼저

1번째 · baseline
```
https://snuhci-study-b.vercel.app/?participant=PILOT01&condition=baseline&order=1
```
2번째 · SceneLens
```
https://snuhci-study-s.vercel.app/?participant=PILOT01&condition=scenelens&order=2
```

## PILOT02 — SceneLens 먼저

1번째 · SceneLens
```
https://snuhci-study-s.vercel.app/?participant=PILOT02&condition=scenelens&order=1
```
2번째 · baseline
```
https://snuhci-study-b.vercel.app/?participant=PILOT02&condition=baseline&order=2
```

## PILOT03 — baseline 먼저

1번째 · baseline
```
https://snuhci-study-b.vercel.app/?participant=PILOT03&condition=baseline&order=1
```
2번째 · SceneLens
```
https://snuhci-study-s.vercel.app/?participant=PILOT03&condition=scenelens&order=2
```

## PILOT04 — SceneLens 먼저

1번째 · SceneLens
```
https://snuhci-study-s.vercel.app/?participant=PILOT04&condition=scenelens&order=1
```
2번째 · baseline
```
https://snuhci-study-b.vercel.app/?participant=PILOT04&condition=baseline&order=2
```

---

## 한쪽만 빠르게 볼 때

도구 하나만 열어 보고 싶을 때 쓴다. 순서 비교를 하지 않으므로 `order=1`로 둔다.

SceneLens
```
https://snuhci-study-s.vercel.app/?participant=PILOT00&condition=scenelens&order=1
```
baseline
```
https://snuhci-study-b.vercel.app/?participant=PILOT00&condition=baseline&order=1
```

## 파일럿을 마치고

Supabase에서 파일럿 행을 지우거나, 분석 때 제외한다. 둘 중 하나를 **분석 전에** 정해 둔다.

```sql
-- 확인
select participant_id, tool, condition, created_at
from study_sessions where participant_id like 'PILOT%'
order by created_at;

-- 지울 때 (되돌릴 수 없다)
delete from study_sessions where participant_id like 'PILOT%';
```