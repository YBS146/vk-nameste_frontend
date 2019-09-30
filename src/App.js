import React from 'react';

// libs
import Axios from 'axios';

// VK
import connect from '@vkontakte/vk-connect';
import connectPromise from "@vkontakte/vkui-connect-promise";
import { 
	Avatar,
	Cell,
	ConfigProvider,
	Div,
	Epic,
	Gallery,
	Group,
	HorizontalScroll,
	List,
	Panel,
	PanelHeader,
	PullToRefresh,
	Spinner,
	Tabbar,
	TabbarItem,
	Tabs,
	TabsItem,
	View
} from '@vkontakte/vkui';
import '@vkontakte/vkui/dist/vkui.css';
// import { IS_PLATFORM_ANDROID, IS_PLATFORM_IOS } from '@vkontakte/vkui/dist/lib/platform';

import Icon28Newsfeed from '@vkontakte/icons/dist/28/newsfeed';
import Icon28User from '@vkontakte/icons/dist/28/profile';
import Icon28Users from '@vkontakte/icons/dist/28/users';
import StarRatings from 'react-star-ratings';
import PlacesTypes from './data/places.json';

// styles
import './styles/App.css';
import persik from './img/persik.png';
import './styles/Persik.css';

const API_VERSION = '5.101';
const APP_NAME = 'НаМесте';
const ENABLE_DEBUG = false;

class App extends React.Component {
	constructor(props) {
		super(props);

		this.state = {
			// app
			activeModal: null,
			activePanel: 'discover',
			activeStory: 'discover',
			activeTab1: 'reviews',
			activeView: 'discover',
			appInitTimestamp: 0,
			isFetchingDiscover: false,
			isFetchingFriends: false,
			isFetchingProfile: false,
			modalData: [],
			modalHistory: [],

			fetchedUser: null,
			isAuthorized: false,

			userData: [],
			userDiscoverFeed: [],
			userFriendsInApp: [],
			userGeodata: null,
			vkAccessToken: null,
		};

		this.onPanelChange = this.onPanelChange.bind(this);
		this.onStoryChange = this.onStoryChange.bind(this);
		this.onViewChange = this.onViewChange.bind(this);
		this.onRefreshDiscover = this.onRefreshDiscover.bind(this);

		this.modalBack = () => {
			this.setActiveModal(this.state.modalHistory[this.state.modalHistory.length - 2]);
		};
	}

	componentDidMount() {
		this.setState({
			appInitTimestamp: this.getTimestamp(),
		});

		// VK CONNECT
		connect.subscribe((e) => {
			if (e.detail.hasOwnProperty('type')) {
				switch (e.detail.type) {
					case 'VKWebAppGetUserInfoResult':
						this.debugLog(e.detail.data);

						// save user data
						this.setState({ fetchedUser: e.detail.data });
	
						// auth user
						Axios.get('https://ybsapi.herokuapp.com/user/authorize/' + e.detail.data.id)
							.then(response => {
								this.debugLog('! YBS-API: user/authorize');

								if (response.data.hasOwnProperty('data')) {
									this.debugLog(response.data.data);

									let user_data = response.data.data;
									if (!user_data.hasOwnProperty('level')) {
										user_data.level = 1;
									}

									this.setState({
										isAuthorized: true,
										userData: user_data,
									});
								} else {
									this.debugLog('! Auth: Failed!');
								}
							})
							.catch(error => {
								this.debugLog('ERROR: ' + error);
							});
						break;
					case 'VKWebAppGeodataResult':
						this.debugLog('! Result: Geodata');
						this.debugLog(e.detail.data.lat + ',' + e.detail.data.long);

						this.setState({ 
							userGeodata: {
								lat: e.detail.data.lat,
								lng: e.detail.data.long
							}
						});
						break;
					case 'VKWebAppAccessTokenReceived':
						this.debugLog('! Result: AccessToken');

						if (e.detail.data.hasOwnProperty('access_token')) {
							this.setState({
								vkAccessToken: e.detail.data.access_token
							});
	
							this.getFriends();
							this.getGroups();
						} else {
							this.debugLog('ACCESS_TOKEN_ERROR');
						}
						break;
					case 'VKWebAppCallAPIMethodResult':
						if (e.detail.data.hasOwnProperty('request_id')) {
							switch (e.detail.data.request_id) {
								case '1fr':
									Axios.post('https://ybsapi.herokuapp.com/user/friends/' + this.state.fetchedUser.id, e.detail.data.response.items)
										.then(response => {
											this.debugLog('! YBS-API: user/friends');
											
											if (response.data.hasOwnProperty('data')) {
												this.debugLog(response.data.data);

												this.setState({
													isFetchingFriends: false,
													userFriendsInApp: response.data.data,
												});
											} else {
												this.debugLog(response.data);
											}
										})
										.catch(error => {
											this.debugLog('ERROR: ' + error);
										});
									break;

								case '1gr':
									Axios.post('https://ybsapi.herokuapp.com/user/communities/' + this.state.fetchedUser.id, e.detail.data.response.items)
										.then(response => {
											this.debugLog('! YBS-API: user/communities');
											
											if (response.data.hasOwnProperty('data')) {
												this.debugLog(response.data.data);

												let feedItems = response.data.data;

												// filter 
												feedItems.map((item, i) => {
													if (item.rating < 3) {
														delete feedItems[i];
													} else {
														// calculate ratio
														feedItems[i].ratio = item.rating * item.user_ratings_total;

														// add type
														let type = item.types[0];

														if (PlacesTypes.hasOwnProperty(type)) {
															feedItems[i].badge = PlacesTypes[type].name || '';
														} else {
															feedItems[i].badge = '';
														}
													}
												});

												// sort by ratio
												feedItems = feedItems.sort(function(a, b) {
													return b.ratio - a.ratio;
												});

												this.setState({
													isFetchingDiscover: false,
													userDiscoverFeed: feedItems,
												});
											} else {
												this.debugLog(response.data);
											}
										})
										.catch(error => {
											this.debugLog('ERROR: ' + error);
										});
									break;
								default:
									this.debugLog(e.detail.data);
							}
						}
						break;
					default:
						this.debugLog('ERROR: ' + e.detail.type);
				}
			}
		});
		connect.send('VKWebAppGetUserInfo', {});
		//connect.send('VKWebAppGetGeodata', {});

		this.getToken();
	}

	callAPI = (method, params) => {
		if (!params.hasOwnProperty('access_token')) {
			params['access_token'] = this.state.vkAccessToken;
		}
		if (!params.hasOwnProperty('v')) {
			params['v'] = API_VERSION;
		}
	
		return connectPromise.send('VKWebAppCallAPIMethod', {
			'method': method,
			'params': params
		}).then(data => {
			return data.data.response;
		}).catch(error => {
			return error;
		});
	};

	debugLog(message) {
		if (!ENABLE_DEBUG) {
			return;
		}

		console.log(message);
	}

	getAppRuntime() {
		return (this.getTimestamp() - this.state.appInitTimestamp);
	}

	getTimestamp() {
		return Math.floor(Date.now() / 1000);
	}

	getFriends() {
		connect.send('VKWebAppCallAPIMethod', {
			'method': 'friends.get',
			'request_id': '1fr',
			'params': {
				'fields': 'first_name,last_name,photo_100,photo_200',
				'count': 1000,
				'order': 'mobile',
				'access_token': this.state.vkAccessToken,
				'v': '5.101',
			}
		});
	}

	getGroups = () => {
		connect.send('VKWebAppCallAPIMethod', {
			'method': 'groups.get',
			'request_id': '1gr',
			'params': {
				'fields': 'description',
				'count': 180,
				'extended': true,
				'access_token': this.state.vkAccessToken,
				'v': '5.101',
			}
		});
	}

	getMe = () => {
		this.setState({ isFetchingProfile: true });
	  
		setTimeout(() => {
			this.setState({
				isFetchingProfile: false
			});
		});
	}

	getToken = () => {
		connect.send('VKWebAppGetAuthToken', {'app_id': 7150409, 'scope': 'friends,groups'});
	}

	onPanelChange (e) {
		this.setState({
			activePanel: e.currentTarget.dataset.panel
		});
	}

	onRefreshDiscover = () => {
		this.setState({ isFetchingDiscover: true });
	  
		setTimeout(() => {
			this.getGroups();
		});
	}

	onRefreshFriends = () => {
		this.setState({ isFetchingFriends: true });
	  
		setTimeout(() => {
			this.getFriends();
		});
	}

	onRefreshProfile = () => {
		this.setState({ isFetchingProfile: true });
	  
		setTimeout(() => {
			this.getMe();
		});
	}

	onStoryChange (e) {
		this.setState({ activeStory: e.currentTarget.dataset.story });
	}

	onViewChange (e) {
		this.setState({ activeView: e.currentTarget.dataset.view });
	}

	render() {
		return (
			<ConfigProvider isWebView={true}>
				<Epic 
					activeStory={this.state.activeStory} 
					tabbar={
						<Tabbar>
							<TabbarItem
								onClick={this.onStoryChange}
								selected={this.state.activeStory === 'discover'}
								data-story="discover"
								text="Актуальное"
							><Icon28Newsfeed /></TabbarItem>
							<TabbarItem
								onClick={this.onStoryChange}
								selected={this.state.activeStory === 'friends'}
								data-story="friends"
								text="Друзья"
							><Icon28Users /></TabbarItem>
							<TabbarItem
								onClick={this.onStoryChange}
								selected={this.state.activeStory === 'profile'}
								data-story="profile"
								text="Профиль"
							><Icon28User /></TabbarItem>
						</Tabbar>
					}
				>
					<View id="discover" activePanel="discover" >
						<Panel id="discover">
							<PanelHeader>
								{ APP_NAME }
							</PanelHeader>
							<PullToRefresh onRefresh={this.onRefreshDiscover} isFetching={this.state.isFetchingDiscover}>
								{(this.state.userDiscoverFeed.length === 0 && this.getAppRuntime() <= 10) && 
									<Group 
										style={{
											paddingTop: '20px',
											paddingBottom: '20px'
										}}
									>
										<Spinner size="medium" style={{ marginTop: 10 }} />
										<Div style={{textAlign: 'center'}}>
											Ищем для Вас что-то новенькое!

											<img className="Persik" src={persik} alt="Persik The Cat"/>
										</Div>
									</Group>
								}

								{(this.state.userDiscoverFeed.length === 0 && this.getAppRuntime() > 10) && 
									<Group 
										style={{
											paddingTop: '20px',
											paddingBottom: '20px'
										}}
									>
										<Div style={{textAlign: 'center'}}>
											Что-то пошло не так...
										</Div>
									</Group>
								}

								<Group>
									<List>
										{this.state.userDiscoverFeed.map((item, i) => 
											<Group 
												key={i} 
												title={ item.name }
												style={{
													marginBottom: '20px',
												}}
											>
												<Gallery
													slideWidth="100%"
													align="center"
													style={{ height: 200 }}
												>
													{ item.photo_url && 
														<div style={{
															width: '100%',

															backgroundImage: 'url("' + item.photo_url + '")',
															backgroundRepeat: 'none',
														}}/>
													}
												</Gallery>
												{	item.rating &&
													<Div style={{
														verticalAlign: 'middle',
														lineHeight: '20px'
													}}>
														<span style={{
															color: '#9a9a9a',
															marginRight: '10px',
														}}>
															{ item.rating }
														</span>
														<StarRatings 
															rating={ item.rating }
															starEmptyColor="#e1e1e1"
															starHoverColor="gold"
															starRatedColor="#ffcc00"
															name="rating"
															starDimension="16px"
															starSpacing="2px"
														/>
														<span style={{
															color: '#9a9a9a',
															marginRight: '5px',
															marginLeft: '7px',
														}}>
															({ item.user_ratings_total || 0 })
														</span>
													</Div>
												}
												<Cell asideContent={ item.badge } description={ item.address } style={{
													marginTop: '-20px',

													fontSize: '14px',
												}}/>
											</Group>
										)}
									</List>
								</Group>
							</PullToRefresh>
						</Panel>
					</View>

					<View id="friends" activePanel="friends">
						<Panel id="friends">
							<PanelHeader>
								{ APP_NAME }
							</PanelHeader>
							<PullToRefresh onRefresh={this.onRefreshFriends} isFetching={this.state.isFetchingFriends}>
								<Group>
									<List>
										{this.state.userFriendsInApp.length === 0 &&
											<Div style={{
												textAlign: 'center'
											}}>
												Ещё никто из Ваших друзей не установил приложение
											</Div>
										}
										
										{this.state.userFriendsInApp.map((item, i) => 
											<Div key={i}>
												<Cell before={<Avatar src={ item.photo_200 } />}>
													<span style={{
														color: '#3a3a3a',
													}}>
														{ item.first_name + ' ' + item.last_name }
													</span>
													<br />
													<span style={{color: '#9a9a9a'}}>
														Новичок
													</span>
												</Cell>
											</Div>
										)}
									</List>
								</Group>
							</PullToRefresh>
						</Panel>
					</View>

					<View id="profile" activePanel="profile">
						<Panel id="profile">
							<PanelHeader>
								{ APP_NAME }
							</PanelHeader>
							<PullToRefresh onRefresh={this.onRefreshProfile} isFetching={this.state.isFetchingProfile}>
								<Group>
									<List>
										{this.state.fetchedUser &&
											<List>
												<Div style={{
													textAlign: 'center'
												}}>
													{this.state.fetchedUser.photo_200 ? 
														<Avatar 
															size={80}
															src={this.state.fetchedUser.photo_200}
															style={{
																margin: '0 auto',
																display: 'block',
															}}
														/> : 
														<Avatar 
															size={80}
															style={{
																margin: '0 auto',
																display: 'block',
															}}
														>
															{/* <Icon28User /> */}
														</Avatar>
													}

													<Div style={{
														color: '#3a3a3a',
														fontSize: '22px',
													}}>
														{`${this.state.fetchedUser.first_name} ${this.state.fetchedUser.last_name}`}
													</Div>
													<Div style={{
														marginTop: '-20px',

														color: '#9a9a9a',
														fontSize: '18px',
													}}>
															Новичок
													</Div>
												</Div>

												<Tabs type="buttons">
													<HorizontalScroll style={{textAlign: 'center'}}>
														<TabsItem
															onClick={() => this.setState({ activeTab1: 'places' })}
															selected={this.state.activeTab1 === 'places'}
														>
															Мои места
														</TabsItem>
														<TabsItem
															onClick={() => this.setState({ activeTab1: 'reviews' })}
															selected={this.state.activeTab1 === 'reviews'}
														>
															Мои отзывы
														</TabsItem>
														<TabsItem
															onClick={() => this.setState({ activeTab1: 'favs' })}
															selected={this.state.activeTab1 === 'favs'}
														>
															Закладки
														</TabsItem>
													</HorizontalScroll>
												</Tabs>

											</List>
										}
									</List>
								</Group>
							</PullToRefresh>
						</Panel>
					</View>
				</Epic>
			</ConfigProvider>
		);
	}
}

export default App;
