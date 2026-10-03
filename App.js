import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import SignUpPage from './src/screens/SignUpPage';
import LoginPage from './src/screens/LoginPage';
import MapScreen from './src/screens/MapScreen';
import FullMapScreen from './src/screens/FullMapScreens';
import OwnerDashboard from './src/screens/OwnerDashboard';
import AddVehicleScreen from './src/screens/AddVehicleScreen';
import AuthLoadingScreen from './src/screens/AuthLoadingScreen';
import Paymentscreen from './src/screens/Paymentscreen';
import AdminDashboard from './src/screens/AdminDashboard';
import AvailableVehiclesScreen from './src/screens/AvailableVehiclesScreen';
import Accountscreen from './src/screens/AccountScreen';
import BookingDetailScreen from './src/screens/Bookingdetailsscreen';
import ChatScreen from "./src/screens/ChatScreen";

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="AuthLoading"
        screenOptions={{ headerShown: false }}
      >
        <Stack.Screen name="AuthLoading" component={AuthLoadingScreen} />
        <Stack.Screen name="Login" component={LoginPage} />
        <Stack.Screen name="SignUp" component={SignUpPage} />
        <Stack.Screen name="MainTabs" component={MapScreen} />
        <Stack.Screen name="Map" component={MapScreen} />
        <Stack.Screen name="Account" component={Accountscreen} />
        <Stack.Screen name="Chat" component={ChatScreen} />
        <Stack.Screen name="FullMap" component={FullMapScreen} />
        <Stack.Screen name="AdminDashboard" component={AdminDashboard} />
        <Stack.Screen name="Payment" component={Paymentscreen} />
        <Stack.Screen name="BookingDetail" component={BookingDetailScreen} />
        <Stack.Screen name="OwnerDashboard" component={OwnerDashboard} />
        <Stack.Screen name="AvailableVehiclesScreen" component={AvailableVehiclesScreen} />
        <Stack.Screen name="AddVehicle" component={AddVehicleScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}