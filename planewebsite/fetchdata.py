import paho.mqtt.client as mqtt
import json
import logging
import time
from datetime import datetime, timedelta

# AWS IoT Core Configuration
BROKER = "a11mcacen68fn4-ats.iot.us-east-1.amazonaws.com"
PORT = 8883
TOPIC = "#"  # Subscribes to all topics

# Path to AWS IoT certificates
CA_CERT = "AmazonRootCA1.pem"
CERT_FILE = "df0ba135cf6cda0605ae2ab3f37c8655965dee9f0dbc14e3c3db8047d4d18bf7-certificate.pem.crt"
KEY_FILE = "df0ba135cf6cda0605ae2ab3f37c8655965dee9f0dbc14e3c3db8047d4d18bf7-private.pem.key"

# Dictionary to store aircraft data by hex code (for internal tracking)
aircraft_data = {}

# Time threshold for considering data stale (5 minutes)
STALE_THRESHOLD = timedelta(minutes=5)

# Callback when a message is received
def on_message(client, userdata, msg):
    try:
        payload = json.loads(msg.payload.decode("utf-8"))
        print(f"Received data at {datetime.utcnow().isoformat()}")
        
        # Handle both single object and list payloads
        if not isinstance(payload, list):
            payload = [payload]
            
        # Process each aircraft in the payload
        for aircraft in payload:
            if 'hex' not in aircraft:
                print(f"Skipping aircraft without hex code: {aircraft}")
                continue
                
            hex_code = aircraft['hex']
            # Add timestamp to track when this aircraft was last seen (for internal use)
            aircraft['last_updated'] = datetime.utcnow().isoformat()
            
            # Update or add the aircraft to our dictionary
            if hex_code in aircraft_data:
                print(f"Updated existing aircraft: {hex_code}")
            else:
                print(f"Added new aircraft: {hex_code}")
                
            aircraft_data[hex_code] = aircraft
        
        # Save current data to file
        save_to_file()
        
        # Remove stale aircraft data (not seen in last 5 minutes)
        cleanup_stale_data()
        
    except json.JSONDecodeError:
        print(f"Error: Received non-JSON message: {msg.payload.decode('utf-8')}")
    except Exception as e:
        print(f"Error processing message: {e}")

# Clean up stale aircraft data
def cleanup_stale_data():
    current_time = datetime.utcnow()
    stale_aircraft = []
    
    for hex_code, aircraft in aircraft_data.items():
        if 'last_updated' in aircraft:
            last_updated = datetime.fromisoformat(aircraft['last_updated'])
            time_difference = current_time - last_updated
            if time_difference > STALE_THRESHOLD:
                stale_aircraft.append(hex_code)
    
    # Remove stale aircraft
    for hex_code in stale_aircraft:
        print(f"Removing stale aircraft: {hex_code} (not updated in >5 minutes)")
        del aircraft_data[hex_code]
    
    if stale_aircraft:
        # Save file again after removing stale aircraft
        save_to_file()

# Save current aircraft data to file
def save_to_file():
    try:
        # Convert dictionary to array for output
        output_array = []
        for hex_code, aircraft in aircraft_data.items():
            # Create a clean copy without the internal tracking fields
            clean_aircraft = aircraft.copy()
            if 'last_updated' in clean_aircraft:
                del clean_aircraft['last_updated']  # Remove internal timestamp
            output_array.append(clean_aircraft)
            
        with open("data.json", "w") as json_file:
            json.dump(output_array, json_file, indent=2)
        print(f"Saved data for {len(aircraft_data)} aircraft to data.json")
    except Exception as e:
        print(f"Error saving file: {e}")

# Callback for successful connection
def on_connect(client, userdata, flags, reason_code, properties=None):
    print(f"Connected with result code {reason_code}")
    if reason_code == 0:
        client.subscribe(TOPIC)
        print(f"Subscribed to topic: {TOPIC}")
    else:
        print(f"Failed to connect, return code: {reason_code}")

# Setup MQTT Client with TLS
client = mqtt.Client(
    client_id="",
    protocol=mqtt.MQTTv5,
    callback_api_version=mqtt.CallbackAPIVersion.VERSION2
)
client.tls_set(ca_certs=CA_CERT,
              certfile=CERT_FILE,
              keyfile=KEY_FILE)

# Assign callbacks
client.on_connect = on_connect
client.on_message = on_message

# Connect to AWS and start listening
logging.basicConfig(level=logging.DEBUG)
client.enable_logger()

# Main execution
if __name__ == "__main__":
    try:
        print("Starting ADS-B Aircraft Tracker...")
        print(f"Stale threshold set to {STALE_THRESHOLD}")
        client.connect(BROKER, PORT, 60)
        client.loop_forever()
    except KeyboardInterrupt:
        print("Program terminated by user")
    except Exception as e:
        print(f"Connection error: {e}")