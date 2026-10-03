import time

from evidencedesk.core import initialize, work_once

if __name__ == "__main__":
    initialize()
    print("EvidenceDesk background worker ready", flush=True)
    while True:
        try:
            if not work_once():
                time.sleep(0.8)
        except KeyboardInterrupt:
            break
        except Exception as error:
            print(type(error).__name__, "Worker temporarily unavailable", flush=True)
            time.sleep(2)
