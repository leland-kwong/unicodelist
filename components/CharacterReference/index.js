import React, { Component } from 'react';
import {
  Input,
  Icon,
  LoadingIndicator,
  GoogleAnalytics,
  Main,
} from '../allComponents';
import { Filters } from './Filters';
import { EntityMatch } from './EntityMatch';
import debounce from 'debounce';
import Router from 'next/router';
import classnames from 'classnames';
import PropTypes from 'prop-types';
import search from './search';
import memoize from 'memoizee';
import { views, getBookmarks } from './modules';
import { migrateCopyHistory } from './migrate-copy-history';
import { name as pageTitle } from '../../site.config';

const noop = () => {};
const basePath = '/';
const batchSize = 80;

const scrollToTop = () => {
  document.body.scrollTop = 0;
};

const updateRoute = function(value = '', filterBy = 'all', page = 0) {
  const query = encodeURIComponent(value);
  const _filter = encodeURIComponent(filterBy);
  const humanFriendlyPage = Number(page) + 1;
  const href = `${basePath}?query=${query}&filterBy=${_filter}&page=${page}&view=list`;
  const as = `${basePath}list/${_filter}?query=${query}&page=${humanFriendlyPage}`;
  Router.push(href, as, { shallow: true });
};

const updateRouteDebounced = debounce(updateRoute, 300);

const MatchesMeasure = (
  /* these are hidden placeholder elements used to measure the size of the element */
  new Array(20).fill(0).map((_, i) => <div key={i} className='Matches__Measure' />)
);

const filterFns = {
  all: (entities) => entities,
  'recently used': (entities) => {
    const frequentlyUsed = getBookmarks();
    const results = entities
      .filter(ent => {
        return frequentlyUsed[ent.hex];
      })
      .sort(function byCopyFrequency(a, b) {
        const uidA = a.hex;
        const countA = frequentlyUsed[uidA];
        const uidB = b.hex;
        const countB = frequentlyUsed[uidB];
        if (countA > countB) {
          return -1;
        }
        if (countA < countB) {
          return 1;
        }
        return 0;
      });
    return results;
  }
};

function inputHandler(query, page, onComplete = noop) {
  const {
    matches,
    totalMatches,
    nbPages
  } = this.findMatches(query, page);
  this.setState({
    // current slice of matches
    matches,
    totalMatches,
    nbPages
  }, onComplete);
}
const debouncedInputHandler = debounce(inputHandler, 100);

const Preset = (value, label = value) => ({ label, value });
const presets = [
  Preset('arrow', 'arrows'),
  Preset('symbol other', 'symbols'),
  Preset('currency', 'currency'),
  Preset('symbol math', 'math'),
  Preset('punctuation', 'punctuation')
];

const ExampleSearchesOnClick = memoize((value, onClick) => () => onClick(value));
const ExampleSearches = ({ onClick }) => {
  const examples = presets.map(({ label, value }) =>
    <span className='ExampleQuery' key={value}>
      <a tabIndex={0} onClick={ExampleSearchesOnClick(value, onClick)}>
        {label}
      </a>
    </span>
  );
  return (
    <div className='block tc nowrap overflow-auto'>
      <span>{examples}</span>
    </div>
  );
};

const EmptyState = ({ query }) => (
  <h2
    className='container-full-width'
    style={{
      textAlign: 'center',
      fontSize: '2rem',
      color: '#8b8b8b',
      marginTop: '2rem',
      textTransform: 'none'
    }}
  >
    <div
      style={{
        marginBottom: '2rem',
        fontSize: '1.2em',
      }}
    >=(</div>
    <p>no entities matching “<strong>{query}</strong>”</p>
  </h2>
);

class AppInfo extends Component {
  state = {
    open: false
  }

  open = () => {
    this.setState({ open: true });
  }

  close = () => {
    this.setState({ open: false });
  }

  render() {
    return (
      <div className='AppInfo'>
        {!this.state.open &&
          <a className='AppInfo__Open' onClick={this.open}>about</a>}
        {this.state.open &&
          <span className='AppInfo__Content'>
            <span>built with ♥ by </span>
            <a href='https://lelandkwong.com/about' target='_blank'>Leland Kwong</a>
          </span>}
        {this.state.open &&
          <span className='AppInfo__Close' onClick={this.close}>x</span>}
      </div>
    );
  }
}

const loadingStates = [
  'fetching entities',
  'settings things up',
];

class CharHelp extends Component {

  state = {
    show: false
  }

  examples = [
    { type: 'description', query: 'arrow north' },
    { type: 'html entity', query: 'nbsp' },
    { type: 'character', query: '©' },
    { type: 'hexadecimal', query: '00b6' },
  ]

  isComponentElem = (event) => {
    let node = event.target;
    while(node.parentNode && (node !== this.elem)) {
      node = node.parentNode;
    }
    return node === this.elem;
  }

  componentDidMount() {
    window.addEventListener('click', (ev) => {
      if (!this.isComponentElem(ev)) this.hideExamples();
    });
  }

  hideExamples = () => {
    if (!this.state.show) return;
    this.setState({ show: false });
  }

  toggleExamples = () => {
    this.setState(({ show }) => ({ show: !show }));
  }

  Examples = () => {
    if (!this.state.show) {
      return null;
    }

    return (
      <div className='CharSearch__HelpExamplesContainer absolute white'>
        <p className='pa3'>You may search by character, description, html entity, hexadecimal, and decimal. Try one of these sample searches:</p>
        <div>
          {this.examples.map(({ type, query }) => {
            return (
              <a key={query} className='CharSearch__HelpExample white db' onClick={() => {
                updateRoute(query);
                this.hideExamples();
              }}
              >
                {type}: <strong>{query}</strong>
              </a>
            );
          })}
        </div>
      </div>
    );
  }

  render () {
    return (
      <div
        className='CharSearch__Help f7'
        ref={el => this.elem = el}
      >
        <a
          className='CharSearch__HelpToggle white relative'
          onClick={this.toggleExamples}
        >examples ▾</a>
        {this.Examples()}
      </div>
    );
  }
}

export class CharacterReference extends Component {

  static propTypes = {
    basePath: PropTypes.string.isRequired,
    query: PropTypes.object.isRequired,
  }

  constructor(props) {
    super(props);
    const { query } = this.props;
    this.state = {
      inputValue: query.query,
      filterBy: query.filterBy,
      matches: [],
      matchesPage: query.page,
      totalMatches: 0,
      // need this data to persist across route transtions
      charRefData: [],
      // used for <ShareLinks>
      pageUrl: '',
      loadingState: 0
    };

    if (process.browser) {
      window.addEventListener('resize', this.updateMatchStyle);

      // fetch dataset
      const fetch = require('isomorphic-fetch');
      this.charRefData = fetch(`${location.protocol}//${location.host}/static/char-ref-full.json`)
        .then(res => res.json());
    }
  }

  componentWillReceiveProps(nextProps) {
    let changed = false;
    const urlQuery = this.getUrlQuery();
    for (const key in nextProps.url.query) {
      if (urlQuery[key] !== nextProps.url.query[key]) {
        changed = true;
        break;
      }
    }
    if (changed) {
      if (nextProps.url.query.view === views.detail) {
        return;
      }

      this.handleInput({
        value: nextProps.url.query.query,
        debounce: false,
        filterBy: nextProps.url.query.filterBy,
        page: nextProps.url.query.page,
        onUpdateComplete: () => {
          scrollToTop();
        }
      });
    }
  }

  componentDidUpdate() {
    if (this.props.url.query.view === views.list) {
      document.body.style.overflowY = 'scroll';
    } else {
      document.body.style.overflowY = 'hidden';
    }
  }

  async componentDidMount() {
    await new Promise((resolve) => {
      this.setState(({ loadingState }) => ({
        pageUrl: location.href,
        loadingState: loadingState + 1
      }), resolve);
    });
    const preparedData = this.charRefData.then(res => {
      const columnTransformations = {
        category(value) {
          return res.categoriesMapping[value] || 'Symbol, Other';
        },
        default(value) {
          return value;
        }
      };
      return res.mappings.map(entity => {
        const newEntity = {};
        const { columnDefs } = res;
        for (let i = 0; i < res.columnDefs.length; i++) {
          const colName = columnDefs[i];
          const transformFn = columnTransformations[colName] || columnTransformations.default;
          newEntity[colName] = transformFn(entity[i]);
        }
        const unicode = newEntity.hex.slice(3, -1);
        newEntity.css = '\\' + unicode;
        newEntity.unicode = `U+${unicode}`;
        return newEntity;
      });
    });
    const charRefData = (await preparedData);
    this.search = search(charRefData);
    migrateCopyHistory();
    this.setState({
      charRefData,
    }, () => {
      this.setState(({ loadingState }) =>
        ({
          loadingState: loadingState + 1,
        })
      );
      // set initial query
      this.handleInput({
        value: this.props.query.query,
        filterBy: this.props.query.filterBy,
        debounce: false,
        force: true,
        page: this.props.query.page
      });
    });

  }

  findMatches = (query, page = 0) => {
    // only trim if more than one character otherwise tab characters and &nbsp; will get trimmed
    const normalizedQuery = query.length > 1 ? query.trim() : query;
    const result = this.search(normalizedQuery);

    const normalizedPage = Number(page);
    const matches = result;
    const { filterBy } = this.getUrlQuery();
    const filteredMatches = filterFns[filterBy](matches);
    const start = page * batchSize;
    const end = (normalizedPage + 1) * batchSize;
    const nbPages = Math.ceil(filteredMatches.length / batchSize);

    return {
      matches: filteredMatches.slice(start, end),
      nbPages,
      totalMatches: filteredMatches.length
    };
  }

  isDataReady = () => {
    return !!this.state.charRefData.length;
  }

  getUrlQuery = () => {
    const { query, filterBy, page = 0, view = views.list, detail = null } = this.props.url.query;
    return {
      view,
      detail,
      page,
      query,
      filterBy: (filterBy in filterFns) ? filterBy : 'all'
    };
  }

  handleInput = ({
    value = '',
    debounce = true,
    // default to first page unless specified
    page = this.getUrlQuery().page,
    force = false,
    filterBy = this.getUrlQuery().filterBy,
    onUpdateComplete = noop
  }) => {
    const hasChanged = value !== this.state.inputValue ||
      filterBy !== this.getUrlQuery().filterBy ||
      page != this.getUrlQuery().page;
    if (!force && !hasChanged) {
      return;
    }
    this.setState({
      inputValue: value,
      matchesPage: Number(page),
      filterBy
    }, () => {
      ((debounce && value.length) ? debouncedInputHandler : inputHandler).call(this, value, page, () => {
        this.updateMatchStyle();
        onUpdateComplete();
      });
    });
  }

  // forces a list refresh
  refreshList = () => {
    this.handleInput({
      value: this.state.inputValue,
      force: true,
      debounce: false,
      page: this.state.matchesPage,
      scrollTop: false
    });
  }

  calcColumns = (calcWith) => {
    let numCols = Math.round(this.measure.clientWidth / calcWith);
    /*
      we want all rows to have an equal number of items
      so that to make it easier to tell if its the last row or not
     */
    while (batchSize % numCols) {
      numCols--;
    }
    return numCols;
  }

  updateMatchStyle = () => {
    const child = this.measure.children[0];
    const matchWidth = Math.floor(child.getBoundingClientRect().width);
    const { marginLeft } = window.getComputedStyle(child);
    const calcWith = matchWidth + parseInt(marginLeft);
    const numCols = this.calcColumns(calcWith);
    if (this.numCols === numCols) {
      return;
    }
    this.numCols = numCols;
    this.matchStyle.textContent = `
.Match {
  flex: 0 0 calc(${100 / numCols}% - ${marginLeft} - ${parseInt(marginLeft) / numCols}px);
}
    `;
  }

  MainView = () => {
    const {
      inputValue,
      matches,
      totalMatches,
      filterBy,
      nbPages,
      matchesPage
    } = this.state;

    const PrevNext = ({ visible = true, page, ...rest }) => {
      const href = `/list/${filterBy}?query=${encodeURIComponent(inputValue)}&page=${page}`;
      if (!visible) {
        return null;
      }
      return (
        <a
          href={href}
          className='dib Btn'
          onClick={(ev) => {
            ev.preventDefault();
            updateRoute(
              inputValue,
              filterBy,
              page
            );
          }}
          {...rest}
        />
      );
    };

    const lastPage = nbPages - 1;
    const PageInfo = (
      <div
        className='f6 pa3'
      >Page {matchesPage + 1} of {nbPages}</div>
    );
    const Pagination = (nbPages > 1) && (
      <div className='Pagination tc mb4 items-center justify-between'>
        {PageInfo}
        <div>
          <PrevNext visible={matchesPage > 0} page={matchesPage - 1}>
            ‹ Previous Page
          </PrevNext>
          &nbsp;
          <PrevNext visible={matchesPage < lastPage} page={matchesPage + 1}>
            Next Page <strong>›</strong>
          </PrevNext>
        </div>
        <div className='color-sub-text f6 pa3'>
          <strong>{totalMatches}</strong> entities total
        </div>
      </div>
    );

    return (
      <main>
        <div className='container-full-width'>
          <h2>
            <Filters
              options={['all', 'recently used'].map(name =>
                ({ label: name, value: name }))
              }
              value={filterBy}
              onClick={(filterBy) => {
                updateRoute('', filterBy);
              }}
            />
          </h2>
          {filterBy === 'all'
            &&
            <ExampleSearches
              onClick={(query) => {
                const { filterBy } = this.getUrlQuery();
                updateRoute(query, filterBy);
              }}
            />}
        </div>
        <div className='MatchesMain'>
          <div className='Match__Measuring'>
            <style className='Match__Style' ref={ref => this.matchStyle = ref} />
            <div className='Matches' ref={ref => this.measure = ref}>
              {MatchesMeasure}
            </div>
          </div>
          {this.isDataReady() && !matches.length
            && <EmptyState query={inputValue} />}
          <div className='Matches'>
            {matches.map((match, index) => (
              <EntityMatch
                key={match.hex}
                index={index}
                view='list'
                metadata={match}
              />
            ))}
          </div>
          {Pagination}
        </div>
      </main>
    );
  }

  DetailView = ({ metadata }) => {
    return (
      <main style={{
        position: 'fixed',
        zIndex: 1,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: '#fff'
      }}
      >
        <div className='overflow-auto'>
          <EntityMatch
            metadata={metadata}
            onCopy={this.refreshList}
            view={this.getUrlQuery().view}
          />
        </div>
      </main>
    );
  }

  render() {
    const { inputValue } = this.state;

    return (
      <Main>
        <header className='AppHeader block'>
          <div className='AppHeader__Info container-full-width'>
            <div className='grid'>
              <h1 className='App__Title'>
                <a
                  href={basePath}
                  className='mid-gray b flex items-center'
                  onClick={(ev) => {
                    ev.preventDefault();
                    updateRoute();
                    scrollToTop();
                  }}
                ><Icon name='logo' className='mr1' /><span>{pageTitle}</span></a>
              </h1>
            </div>
            <div className='AppHeader__InfoLinks'>
              <a className='grid' href='mailto:leland.kwong@gmail.com' target='_blank'>
                <Icon name='mail3' />&nbsp;<span>bug reports & feedback</span>
              </a>
            </div>
          </div>
          <section
            className='AppHeader__Controls container-full-width'
            style={{ display: 'flex', 'flexDirection': 'column', 'alignItems': 'stretch', flexGrow: 1, justifyContent: 'center' }}
          >
            <div className='grid'>
              <div style={{ flexGrow: 1, position: 'relative' }}>
                <Input
                  type='search'
                  autoFocus={true}
                  containerClassName='CharSearch'
                  onChange={ev => {
                    this.handleInput({
                      value: ev.target.value,
                      page: 0,
                      onUpdateComplete: scrollToTop
                    });
                    updateRouteDebounced(ev.target.value, this.getUrlQuery().filterBy, 0);
                  }}
                  value={inputValue}
                  placeholder={`search entities`}
                  inputRef={input => this.input = input}
                />
                {!inputValue.length && <CharHelp />}
              </div>
            </div>
          </section>
        </header>
        {this.MainView()}
        {(this.getUrlQuery().view === views.detail)
          && this.isDataReady()
          && this.DetailView({ metadata: this.findMatches(this.getUrlQuery().detail).matches[0] })}
        <AppInfo />
        <div
          className={classnames(
            'Matches__FetchingIndicatorContainer',
            { 'App--isSettingUp': this.state.loadingState < loadingStates.length }
          )}
        >
          <h1
            className='App__Title'
            style={{ position: 'absolute', top: '1rem', left: '1rem', margin: 0 }}
          >{pageTitle}</h1>
          <LoadingIndicator style={{ marginTop: '-4rem' }} />
          <h4>{loadingStates[this.state.loadingState]}</h4>
        </div>
        <GoogleAnalytics />
      </Main>
    );
  }
}
