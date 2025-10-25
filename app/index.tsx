import React, { useRef } from "react";
import { View, Text, Button, ActivityIndicator, StyleSheet, Dimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import Constants from 'expo-constants'; // Import Constants

const { width } = Dimensions.get("window");

// 1. Get the Metro server's address
// This is the magic part. In a dev build, this will be your computer's IP.
const { manifest2 } = Constants;
const metroServer = manifest2?.extra?.expoGo?.debuggerHost;
const host = metroServer?.split(':')?.[0] || '127.0.0.1'; // Fallback for web
const port = 8081; // Default Metro port

// 2. Define the static URLs for your editors
const monacoUrl = `http://${host}:${port}/editor/index.html`;

// Your simple HTML content for quick checks
const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      margin: 0;
      padding: 0;
      background: #101010;
      color: #fff;
      font-family: sans-serif;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      height: 100%;
    }
    h2 { margin-bottom: 10px; }
    p { opacity: 0.8; }
    button {
      background: #4CAF50;
      border: none;
      padding: 10px 20px;
      border-radius: 6px;
      color: white;
      font-size: 16px;
      margin-top: 10px;
    }
  </style>
</head>
<body>
  <h2>Hello from HTML 👋</h2>
  <p>This area fills 100% width and 400px height.</p>
  <button onclick="sendMessage()">Send Message</button>

  <script>
    function sendMessage() {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(
          JSON.stringify({
            type: 'click',
            payload: 'Button clicked in HTML at ' + new Date().toLocaleTimeString()
          })
        );
      }
    }
  </script>
</body>
</html>
`;

export default function IndexScreen() {
  const webViewRef = useRef<WebView>(null);
  const [message, setMessage] = React.useState("Waiting for messages from HTML...");
  const [useMonaco, setUseMonaco] = React.useState(true);

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      
      if (data.type === "click") {
        // This is from your simple mode
        setMessage(data.payload);
        
      } else if (data.type === "run") {
        // --- THIS IS THE FIX ---
        // Log the code to your PC's terminal
        console.log("--- Code from Editor (Run Button) ---");
        console.log(data.payload,"\n\n","\n\n");
        
        // This line (which you already have) shows it in the app's output box
        setMessage(data.payload);
        
      } else if (data.type === "code") {
        // This is from the 'onDidChangeContent' (every keystroke)
        console.log("Code:", data.payload.substring(0, 50) + "...","\n\n");
      } else if (data.type === "error") {
        console.error("WebView Error:", data.message);
        setMessage(`WebView Error: ${data.message}`);
      }
    } catch {
      console.warn("Received invalid message:", event.nativeEvent.data);
    }
  };

  const sendToWebView = () => {
  const jsToInject = `
    try {
      // 1. Call the new global variable
      const code = window.editorInstance.getValue();

      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(
          JSON.stringify({ type: "run", payload: code })
        );
      }
    } catch (e) {
      window.ReactNativeWebView.postMessage(
        // 2. Updated error message for clarity
        JSON.stringify({ type: "error", message: "Failed to get code: " + e.message })
      );
    }
    true; // Required for Android
  `;

  webViewRef.current?.injectJavaScript(jsToInject);
};

  const renderWebLoading = () => (
    <View style={styles.loading}>
      <ActivityIndicator color="#4CAF50" size="large" />
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {useMonaco ? "Monaco Editor" : "Simple HTML"}
        </Text>
        <Button
          title={useMonaco ? "Use Simple" : "Use Monaco"}
          onPress={() => setUseMonaco(!useMonaco)}
        />
        <Button title="RUN" onPress={sendToWebView} />
      </View>

      {/* WebView container (400px height) */}
      <View style={styles.webViewBox}>
        <WebView
          ref={webViewRef}
          originWhitelist={["*"]}
          
          // 3. THIS IS THE KEY CHANGE. NO MORE USEEFFECT!
          source={useMonaco ? { uri: monacoUrl } : { html: htmlContent }}

          onMessage={handleMessage}
          javaScriptEnabled
          domStorageEnabled
          startInLoadingState
          renderLoading={renderWebLoading}
          style={{ flex: 1, backgroundColor: "#1e1e1e" }}
        />
      </View>

      {/* Output */}
      <View style={styles.outputBox}>
        <Text style={styles.outputLabel}>Output:</Text>
        <Text style={styles.outputText}>{message}</Text>
      </View>
    </SafeAreaView>
  );
}

// ... (Your full styles object)
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  header: { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: "#1e1e1e", flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "600" },
  webViewBox: { width, height: 400, borderColor: "#333", borderWidth: 1, backgroundColor: "#101010", overflow: "hidden" },
  loading: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#101010" },
  outputBox: { flex: 1, padding: 16, backgroundColor: "#1e1e1e", borderTopWidth: 1, borderTopColor: "#333" },
  outputLabel: { color: "#aaa", fontSize: 14, marginBottom: 4 },
  outputText: { color: "#4CAF50", fontSize: 15 },
});