import joblib, time, warnings
warnings.filterwarnings('ignore')

print("Loading model...")
model = joblib.load('backend/Model final.joblib')
text = ['fuck thi splace']

print("Warming up...")
model.predict_proba(text)

n = 1000
print(f"Running {n} predictions...")
t0 = time.perf_counter()
for _ in range(n):
    model.predict_proba(text)
t1 = time.perf_counter()

total = t1 - t0
avg_ms = (total / n) * 1000

print(f"Total time for {n} predictions: {total:.4f} seconds")
print(f"Average time per prediction: {avg_ms:.4f} ms")
