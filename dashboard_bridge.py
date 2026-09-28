#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json
import os
import ssl
import uuid
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable, Optional, Tuple

import boto3
import paho.mqtt.client as mqtt

try:
    from zoneinfo import ZoneInfo
    TZ = ZoneInfo("America/Sao_Paulo")
except Exception:
    import pytz
    TZ = pytz.timezone("America/Sao_Paulo")


MQTT_BROKER = os.getenv("AWS_IOT_ENDPOINT", "a1xb4e7ftt8wtn-ats.iot.us-east-1.amazonaws.com")
MQTT_PORT = int(os.getenv("AWS_IOT_PORT", "8883"))
MQTT_CLIENT_ID = os.getenv("MQTT_CLIENT_ID", f"i2horti-dashboard-{uuid.uuid4().hex[:8]}")

BASE_DIR = Path(__file__).resolve().parent
CERT_DIR = BASE_DIR / "aws_iot"

IOT_ROOT_CA = os.getenv("IOT_ROOT_CA", str(CERT_DIR / "AmazonRootCA1.pem"))
IOT_CERT_PEM = os.getenv("IOT_CERT_PEM", str(CERT_DIR / "raspgaby.cert.pem"))
IOT_PRIV_KEY = os.getenv("IOT_PRIV_KEY", str(CERT_DIR / "raspgaby.private.key"))

S3_BUCKET_NAME = os.getenv("S3_BUCKET_NAME", "raspbpibucket")
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")

TOPICS = {
    "previsao/simepar": "previsao_simepar",
    "plugfield/forecast/daily": "plugfield_forecast_daily",
    "plugfield/forecast/hourly": "plugfield_forecast_hourly",
    "canteiros/get": "canteiros_get",
    "cultures/get": "cultures_get",
    "irrigationRBS/schedule": "irrigationRBS_schedule",
    "irrigationRL/schedule": "irrigationRL_schedule",
}

DEFAULT_UC_BY_TOPIC = {
    "plugfield/forecast/daily": os.getenv("DEFAULT_PLUGFIELD_UC_ID", "4000"),
    "plugfield/forecast/hourly": os.getenv("DEFAULT_PLUGFIELD_UC_ID", "4000"),
}


def now_local() -> datetime:
    return datetime.now(TZ)


def json_body(data: Any) -> bytes:
    return json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")


def get_uc_id(payload: Any) -> Optional[str]:
    if not isinstance(payload, dict):
        return None
    uc = payload.get("UC_id", payload.get("uc_id"))
    if uc is None and isinstance(payload.get("data"), dict):
        uc = payload["data"].get("UC_id", payload["data"].get("uc_id"))
    if uc is None:
        return None
    return str(uc)


def iter_uc_payloads(topic: str, payload: Any) -> Iterable[Tuple[Optional[str], Any]]:
    if isinstance(payload, list):
        yielded = False
        for item in payload:
            uc = get_uc_id(item)
            if uc is not None:
                yielded = True
                yield uc, item
        if yielded:
            return
    yield get_uc_id(payload) or DEFAULT_UC_BY_TOPIC.get(topic), payload


def make_metadata(topic: str) -> Dict[str, Any]:
    ts = now_local()
    return {
        "received_at_local": ts.isoformat(timespec="seconds"),
        "topic": topic,
        "message_id": str(uuid.uuid4()),
        "date": ts.date().isoformat(),
    }


def with_metadata(payload: Any, topic: str) -> Any:
    if isinstance(payload, dict):
        result = dict(payload)
        result["_metadata"] = make_metadata(topic)
        return result
    return {
        "data": payload,
        "_metadata": make_metadata(topic),
    }


def is_empty_payload(payload: Any) -> bool:
    if payload is None:
        return True
    if isinstance(payload, list):
        return len(payload) == 0
    if isinstance(payload, dict):
        data = payload.get("data")
        if isinstance(data, list) and len(data) == 0:
            return True
    return False


class DashboardBridge:
    def __init__(self) -> None:
        self.s3 = boto3.client("s3", region_name=AWS_REGION)
        self.daily_history = defaultdict(list)

    def put_json(self, key: str, payload: Any) -> None:
        kwargs = {
            "Bucket": S3_BUCKET_NAME,
            "Key": key,
            "Body": json_body(payload),
            "ContentType": "application/json; charset=utf-8",
            "CacheControl": "no-store, no-cache, must-revalidate, max-age=0",
        }
        try:
            self.s3.put_object(**kwargs, ACL="public-read")
        except Exception:
            self.s3.put_object(**kwargs)

    def save_payload(self, topic: str, payload: Any) -> None:
        folder = TOPICS[topic]
        day = now_local().strftime("%Y%m%d")
        dated = now_local().strftime("%Y/%m/%d")

        if topic.startswith("plugfield/") and is_empty_payload(payload):
            print(
                f"{now_local().strftime('%H:%M:%S')} ignorado {topic}: payload vazio",
                flush=True,
            )
            return

        enriched = with_metadata(payload, topic)

        self.put_json(f"dashboard/{folder}.json", enriched)

        for uc_id, uc_payload in iter_uc_payloads(topic, payload):
            if uc_id:
                uc_enriched = with_metadata(uc_payload, topic)
                if isinstance(uc_enriched, dict) and "UC_id" not in uc_enriched:
                    uc_enriched["UC_id"] = int(uc_id) if str(uc_id).isdigit() else uc_id
                self.put_json(f"dashboard/{folder}_uc{uc_id}.json", uc_enriched)
                self.put_json(f"dashboard/{folder}_{uc_id}.json", uc_enriched)

        record = {
            "timestamp": now_local().isoformat(timespec="seconds"),
            "topic": topic,
            "data": payload,
        }
        self.daily_history[(folder, day)].append(record)
        self.put_json(
            f"dashboard/history/{folder}/{dated}/{day}.json",
            self.daily_history[(folder, day)],
        )

    def on_connect(self, client, userdata, flags, rc):
        print(f"Conectado ao AWS IoT: rc={rc}", flush=True)
        for topic in TOPICS:
            client.subscribe(topic)
            print(f"Subscrito: {topic}", flush=True)

    def on_message(self, client, userdata, msg):
        try:
            payload = json.loads(msg.payload.decode("utf-8"))
            self.save_payload(msg.topic, payload)
            uc = get_uc_id(payload) or DEFAULT_UC_BY_TOPIC.get(msg.topic)
            print(
                f"{now_local().strftime('%H:%M:%S')} salvo {msg.topic}"
                f"{' | UC_id=' + uc if uc else ''}",
                flush=True,
            )
        except Exception as exc:
            print(f"Erro ao processar {msg.topic}: {exc}", flush=True)

    def run(self) -> None:
        client = mqtt.Client(client_id=MQTT_CLIENT_ID)
        client.tls_set(
            ca_certs=IOT_ROOT_CA,
            certfile=IOT_CERT_PEM,
            keyfile=IOT_PRIV_KEY,
            tls_version=ssl.PROTOCOL_TLSv1_2,
        )
        client.on_connect = self.on_connect
        client.on_message = self.on_message
        client.connect(MQTT_BROKER, MQTT_PORT)
        client.loop_forever()


if __name__ == "__main__":
    DashboardBridge().run()
