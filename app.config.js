import 'dotenv/config';

export default {
  expo: {
    name: "my-app",
    slug: "my-app",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    newArchEnabled: true,
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff",
    },
    ios: {
      supportsTablet: true,
      config: {
        googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
      },
    },
    android: {
      package: "com.myapp.expo",
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#ffffff",
      },
      config: {
        googleMaps: {
          apiKey: process.env.GOOGLE_MAPS_API_KEY,
        },
      },
      androidNavigationBar: {
        backgroundColor: "#ffffff",
        barStyle: "dark-content",
      },
    },
    web: {
      favicon: "./assets/favicon.png",
    },
    plugins: [
      
      [
        "expo-location",
        {
          locationAlwaysAndWhenInUsePermission: "Allow my-app to use your location.",
        },
      ],
    ],
  },
};